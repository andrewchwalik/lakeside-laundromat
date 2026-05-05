const ALLOWED_ORIGINS = new Set([
  "https://lakesidelaundromat.com",
  "https://www.lakesidelaundromat.com",
  "https://andrewchwalik.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);
const INSTAGRAM_FEED_URL = "https://rss.app/feeds/v1.1/MgEgN3USbt9ulJBb.json";
const INSTAGRAM_IMAGE_HOST_PATTERN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

function buildCorsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(origin),
    },
  });
}

function isAllowedInstagramImage(url) {
  return INSTAGRAM_IMAGE_HOST_PATTERN.test(url.hostname);
}

async function handleInstagramFeed(request, origin) {
  const feedResponse = await fetch(INSTAGRAM_FEED_URL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!feedResponse.ok) {
    return jsonResponse({ error: "Unable to load Instagram feed." }, 502, origin);
  }

  const feed = await feedResponse.json();
  const workerUrl = new URL(request.url);
  const items = Array.isArray(feed.items)
    ? feed.items
        .map((item) => {
          const rawImage =
            (typeof item.image === "string" && item.image.trim()) ||
            (typeof item.attachments?.[0]?.url === "string" &&
              item.attachments[0].url.trim()) ||
            "";

          if (!rawImage) {
            return null;
          }

          const proxiedImageUrl = new URL("/api/instagram-image", workerUrl);
          proxiedImageUrl.searchParams.set("src", rawImage);

          return {
            title:
              (typeof item.title === "string" && item.title.trim()) ||
              (typeof item.content_text === "string" && item.content_text.trim()) ||
              "",
            image: proxiedImageUrl.toString(),
          };
        })
        .filter(Boolean)
    : [];

  return jsonResponse({ items }, 200, origin);
}

async function handleInstagramImage(request, origin) {
  const url = new URL(request.url);
  const src = url.searchParams.get("src");

  if (!src) {
    return jsonResponse({ error: "Missing src parameter." }, 400, origin);
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(src);
  } catch {
    return jsonResponse({ error: "Invalid src parameter." }, 400, origin);
  }

  if (!isAllowedInstagramImage(sourceUrl)) {
    return jsonResponse({ error: "Image source not allowed." }, 403, origin);
  }

  const imageResponse = await fetch(sourceUrl.toString(), {
    headers: {
      Referer: "https://www.instagram.com/",
    },
  });

  if (!imageResponse.ok) {
    return jsonResponse({ error: "Unable to load image." }, 502, origin);
  }

  const headers = new Headers(imageResponse.headers);
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");

  const corsHeaders = buildCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(imageResponse.body, {
    status: 200,
    headers,
  });
}

function normalizeField(value) {
  return typeof value === "string" ? value.trim() : "";
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin),
      });
    }

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse({ error: "Origin not allowed." }, 403, origin);
    }

    if (request.method === "GET" && url.pathname === "/api/instagram-feed") {
      return handleInstagramFeed(request, origin);
    }

    if (request.method === "GET" && url.pathname === "/api/instagram-image") {
      return handleInstagramImage(request, origin);
    }

    if (request.method !== "POST" || url.pathname !== "/api/jobs") {
      return jsonResponse({ error: "Not found." }, 404, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
    }

    const submission = {
      name: normalizeField(payload.name),
      email: normalizeField(payload.email),
      phone: normalizeField(payload.phone),
      address: normalizeField(payload.address),
      experience: normalizeField(payload.experience),
    };

    const missing = Object.entries(submission)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      return jsonResponse(
        { error: `Missing required fields: ${missing.join(", ")}.` },
        400,
        origin,
      );
    }

    const discordPayload = {
      username: "Lakeside Jobs Form",
      embeds: [
        {
          title: "New Jobs Form Submission",
          color: 0x0bb5ef,
          fields: [
            { name: "Name", value: submission.name },
            { name: "Email", value: submission.email },
            { name: "Phone Number", value: submission.phone },
            { name: "Address", value: submission.address },
            {
              name: "Relevant Experience",
              value: submission.experience,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const discordResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordPayload),
    });

    if (!discordResponse.ok) {
      return jsonResponse({ error: "Failed to send to Discord." }, 502, origin);
    }

    return jsonResponse({ ok: true }, 200, origin);
  },
};
