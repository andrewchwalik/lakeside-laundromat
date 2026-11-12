import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { eligible, refresh, media } from './worker.mjs';
const task = 'task';
function environment() {
  const map = new Map();
  return { APIFY_TOKEN: 'test-only', APIFY_TASK_ID: task, INSTAGRAM_HANDLE: 'thewashcomp', map,
    CACHE: { get: async (k, type) => type === 'json' && map.has(k) ? JSON.parse(map.get(k)) : map.get(k), put: async (k,v) => map.set(k,v), delete: async k => map.delete(k) } };
}
test('sorts own and collaborative posts independently of pinned order', () => {
  const posts = [{ shortCode:'old', timestamp:'2026-01-01',ownerUsername:'thewashcomp' }, {shortCode:'new',timestamp:'2026-11-01',coauthorProducers:[{username:'thewashcomp'}]}, {shortCode:'other',timestamp:'2026-11-12',ownerUsername:'other'}];
  assert.deepEqual(eligible(posts,'thewashcomp').map(p=>p.shortCode),['new','old']);
});
test('public callers cannot start scraper runs',async()=>assert.equal((await worker.fetch(new Request('https://test/feed.json',{method:'POST'}),{},{})).status,405));
test('recent check avoids upstream requests',async()=>{const env=environment();env.map.set('checkedAt',String(Date.now()));await refresh(env);assert.equal(env.map.size,1);});
test('rejects unsafe image hosts and protocol',async()=>{await assert.rejects(media('http://a.fbcdn.net/image'));await assert.rejects(media('https://fbcdn.net.evil.test/image'));});
test('stores bytes before manifest and preserves last good content on failure',async()=>{
 const env=environment(), original=globalThis.fetch, writes=[];
 env.CACHE.put=async(k,v)=>{writes.push(k);env.map.set(k,v);};
 globalThis.fetch=async(url,options)=>{
   assert.notEqual(options?.method,'POST');
   if(String(url).includes('/actor-tasks/')) return Response.json({data:{items:[{id:'run',actorTaskId:task,status:'SUCCEEDED',defaultDatasetId:'dataset'}]}});
   if(String(url).includes('/datasets/')) return Response.json([{shortCode:'post',timestamp:'2026-11-01',ownerUsername:'thewashcomp',displayUrl:'https://a.fbcdn.net/img'}]);
   assert.equal(options.redirect,'manual');return new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}});
 };
 try {
   await refresh(env,new Date('2026-11-12'));
   assert(writes.indexOf('media/post/run') < writes.indexOf('feed'));
   const saved=env.map.get('feed');assert.equal(JSON.parse(saved).items[0].id,'post');
   globalThis.fetch=async()=>new Response('',{status:503});
   await refresh(env,new Date('2026-11-13'));assert.equal(env.map.get('feed'),saved);assert.equal(JSON.parse(env.map.get('state')).status,'failed');
 } finally {globalThis.fetch=original;}
});
test('rejects another task even when API returns a successful run',async()=>{
 const env=environment(),original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({data:{items:[{id:'run',actorTaskId:'wrong',status:'SUCCEEDED'}]}});
 try {await refresh(env);assert(!env.map.has('feed'));}finally{globalThis.fetch=original;}
});
test('older posts cannot replace newer cached content',async()=>{
 const env=environment(),original=globalThis.fetch;
 const saved=JSON.stringify({runId:'oldrun',items:[{timestamp:'2026-11-12',image:'/media/current/run'}]});env.map.set('feed',saved);
 globalThis.fetch=async url=>String(url).includes('/runs?') ? Response.json({data:{items:[{id:'newrun',actorTaskId:task,status:'SUCCEEDED',defaultDatasetId:'dataset'}]}}) : Response.json([{shortCode:'post',timestamp:'2026-01-01',ownerUsername:'thewashcomp'}]);
 try {await refresh(env);assert.equal(env.map.get('feed'),saved);assert.equal(JSON.parse(env.map.get('state')).error,'Older result rejected');}finally{globalThis.fetch=original;}
});
test('rejects redirects and false image signatures',async()=>{
 const original=globalThis.fetch;
 try {
   globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://evil.test'}});
   await assert.rejects(media('https://a.fbcdn.net/img'),/Invalid image response/);
   globalThis.fetch=async()=>new Response('not an image',{headers:{'content-type':'image/jpeg'}});
   await assert.rejects(media('https://a.fbcdn.net/img'),/Invalid image signature/);
 }finally{globalThis.fetch=original;}
});
