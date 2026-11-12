const API = 'https://api.apify.com/v2';
const ORIGINS = new Set(['https://lakesidelaundromat.com', 'https://www.lakesidelaundromat.com', 'https://andrewchwalik.github.io', 'http://localhost:5500', 'http://127.0.0.1:5500']);
export function eligible(posts, handle) {
  return posts.filter(p => /^[\w-]+$/.test(p.shortCode || '') && Number.isFinite(Date.parse(p.timestamp)) &&
    (p.ownerUsername === handle || p.coauthorProducers?.some(a => a.username === handle)))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 10);
}
async function api(env, path, signal) {
  const response = await fetch(API + path, { method: 'GET', headers: { Authorization: `Bearer ${env.APIFY_TOKEN}` }, signal });
  if (!response.ok) throw new Error(`Apify HTTP ${response.status}`);
  return response.json();
}
export async function media(url, signal) {
  const source = new URL(url);
  if (source.protocol !== 'https:' || !/(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(source.hostname)) throw new Error('Unexpected media host');
  const response = await fetch(source, { redirect: 'manual', signal });
  const type = (response.headers.get('content-type') || '').split(';')[0];
  if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error('Invalid image response');
  const reader = response.body.getReader();
  const parts = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('Image exceeds cache limit'); }
    parts.push(value);
  }
  const data = new Uint8Array(size); let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.length; }
  const text = bytes => new TextDecoder().decode(bytes);
  const valid = type === 'image/jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255
    : type === 'image/png' ? [137,80,78,71,13,10,26,10].every((b,i) => data[i] === b)
    : text(data.slice(0,4)) === 'RIFF' && text(data.slice(8,12)) === 'WEBP';
  if (!valid) throw new Error('Invalid image signature');
  return { data, type };
}
export async function refresh(env, now = new Date()) {
  const checked = await env.CACHE.get('checkedAt');
  if (checked && now.getTime() - Number(checked) < 900000) return;
  if (!env.APIFY_TOKEN || !env.APIFY_TASK_ID) throw new Error('Missing source configuration');
  await env.CACHE.put('checkedAt', String(now.getTime()));
  // All upstream requests share a deadline inside waitUntil's 30-second lifetime.
  const signal = AbortSignal.timeout(24000);
  const staged = [];
  let published = false;
  try {
    const { data } = await api(env, `/actor-tasks/${env.APIFY_TASK_ID}/runs?limit=1&desc=true&status=SUCCEEDED`, signal);
    const run = data.items?.[0];
    if (!run || run.status !== 'SUCCEEDED' || run.actorTaskId !== env.APIFY_TASK_ID) throw new Error('No successful run for the configured task');
    const previous = await env.CACHE.get('feed', 'json');
    if (previous?.runId === run.id) return;
    const posts = eligible(await api(env, `/datasets/${run.defaultDatasetId}/items?limit=10&clean=true`, signal), env.INSTAGRAM_HANDLE);
    if (!posts.length) throw new Error('No eligible profile posts');
    if (previous && Date.parse(posts[0].timestamp) < Date.parse(previous.items[0].timestamp)) throw new Error('Older result rejected');
    const items = [];
    for (let i = 0; i < posts.length; i += 3) {
      const batch = await Promise.allSettled(posts.slice(i, i + 3).map(async post => {
        const image = await media(post.displayUrl, signal);
        const key = `media/${post.shortCode}/${run.id}`;
        await env.CACHE.put(key, image.data, { metadata: { contentType: image.type } });
        staged.push(key);
        return { id: post.shortCode, title: post.caption || '', url: `https://www.instagram.com/p/${post.shortCode}/`, timestamp: post.timestamp, type: post.type, image: `/${key}` };
      }));
      const failed = batch.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      items.push(...batch.map(result => result.value));
    }
    const feed = { items, runId: run.id, updatedAt: now.toISOString(), source: 'apify-cached' };
    // Publish only after every image is durable. Retain the previous generation.
    await env.CACHE.put('feed', JSON.stringify(feed));
    published = true;
    const retired = await env.CACHE.get('retired', 'json') || [];
    await env.CACHE.put('retired', JSON.stringify(previous?.items.map(p => p.image.slice(1)) || []));
    for (const key of retired) await env.CACHE.delete(key);
    await env.CACHE.put('state', JSON.stringify({ status: 'succeeded', updatedAt: feed.updatedAt, postTimestamp: items[0].timestamp, count: items.length, runChargeUsd: run.usageTotalUsd ?? null }));
  } catch (error) {
    if (!published) await Promise.allSettled(staged.map(key => env.CACHE.delete(key)));
    console.error(JSON.stringify({ event: 'instagram-refresh-failed', message: error.message }));
    const reason = /^(Apify HTTP \d+|No successful run for the configured task|No eligible profile posts|Older result rejected|Unexpected media host|Invalid image response|Invalid image signature|Image exceeds cache limit)$/.test(error.message) ? error.message : 'Upstream collection unavailable';
    await env.CACHE.put('state', JSON.stringify({ status: 'failed', attemptedAt: now.toISOString(), error: reason }));
  }
}
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const headers = { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const json = (body, status = 200) => Response.json(body, { status, headers });
    if (origin && !ORIGINS.has(origin)) return json({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ service: 'Lakeside Instagram', profile: env.INSTAGRAM_HANDLE, state: await env.CACHE.get('state', 'json') });
    if (url.pathname === '/feed.json') {
      let feed = await env.CACHE.get('feed', 'json');
      if (feed) ctx.waitUntil(refresh(env).catch(error => console.error(error.message)));
      else { await refresh(env); feed = await env.CACHE.get('feed', 'json'); }
      return feed ? json({ ...feed, items: feed.items.map(p => ({ ...p, image: new URL(p.image, url).href })) }) : json({ error: 'Awaiting first successful collection' }, 503);
    }
    if (/^\/media\/[\w-]+\/[\w-]+$/.test(url.pathname)) {
      const image = await env.CACHE.getWithMetadata(url.pathname.slice(1), 'arrayBuffer');
      if (!image.value) return json({ error: 'Image not found' }, 404);
      return new Response(request.method === 'HEAD' ? null : image.value, { headers: { ...headers, 'Content-Type': image.metadata.contentType, 'Cache-Control': 'public, max-age=300' } });
    }
    return json({ error: 'Not found' }, 404);
  }
};
