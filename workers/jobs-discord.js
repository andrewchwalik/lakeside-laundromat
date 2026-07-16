const ALLOWED_ORIGINS = new Set([
  "https://lakesidelaundromat.com",
  "https://www.lakesidelaundromat.com",
  "https://andrewchwalik.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);
const INSTAGRAM_FEED_URL = "https://rss.app/feeds/v1.1/MgEgN3USbt9ulJBb.json";
const INSTAGRAM_IMAGE_HOST_PATTERN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
const BIN_ACTIONS = {
  ready: {
    label: "Dirty laundry is ready for pickup",
    emoji: "🧺",
    color: 0xf59e0b,
  },
  picked_up: {
    label: "Dirty laundry has been picked up",
    emoji: "🚐",
    color: 0x0bb5ef,
  },
  clean_delivered: {
    label: "Clean laundry dropped off",
    emoji: "✨",
    color: 0x22c55e,
  },
};

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
            url:
              (typeof item.url === "string" && item.url.trim()) ||
              (typeof item.external_url === "string" && item.external_url.trim()) ||
              "",
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

function getLocations(env) {
  try {
    const locations = JSON.parse(env.BIN_LOCATIONS_JSON || "[]");
    return Array.isArray(locations) ? locations : [];
  } catch {
    return [];
  }
}

function findLocation(env, id, token) {
  return getLocations(env).find(
    (location) =>
      location.id === id &&
      typeof location.token === "string" &&
      location.token.length >= 16 &&
      location.token === token,
  );
}

function formatEasternTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function sendBinDiscord(
  env,
  location,
  action,
  binCount,
  submittedBy,
  note,
  occurredAt,
) {
  const webhookUrl =
    location.discordWebhookUrl || env.BIN_DISCORD_WEBHOOK_URL || env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, status: 0 };

  const actionDetails = BIN_ACTIONS[action];
  const fields = [
    { name: "Location", value: location.name, inline: true },
    { name: "Number of bins", value: String(binCount), inline: true },
    { name: "Time", value: formatEasternTime(occurredAt), inline: true },
  ];

  if (submittedBy) fields.push({ name: "Submitted by", value: submittedBy });
  if (note) fields.push({ name: "Note", value: note });

  return fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Lakeside Bin Updates",
      embeds: [
        {
          title: `${actionDetails.emoji} ${actionDetails.label}`,
          color: actionDetails.color,
          fields,
        },
      ],
    }),
  });
}

async function sendBinEmail(
  env,
  location,
  action,
  binCount,
  submittedBy,
  note,
  occurredAt,
) {
  const recipients = Array.isArray(location.emails)
    ? location.emails.filter((email) => typeof email === "string" && email.includes("@"))
    : [];

  if (!recipients.length) return { ok: true };
  // Discord can go live while a new Resend sender domain is still being verified.
  // As soon as BIN_EMAIL_FROM is configured, owner emails begin automatically.
  if (!env.RESEND_API_KEY || !env.BIN_EMAIL_FROM) {
    console.warn("Bin owner email skipped because email sending is not configured.");
    return { ok: true };
  }

  const actionDetails = BIN_ACTIONS[action];
  const details = [
    `<p><strong>Location:</strong> ${escapeHtml(location.name)}</p>`,
    `<p><strong>Number of bins:</strong> ${binCount}</p>`,
    `<p><strong>Time:</strong> ${escapeHtml(formatEasternTime(occurredAt))}</p>`,
    submittedBy ? `<p><strong>Submitted by:</strong> ${escapeHtml(submittedBy)}</p>` : "",
    note ? `<p><strong>Note:</strong> ${escapeHtml(note)}</p>` : "",
  ].join("");

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.BIN_EMAIL_FROM,
      to: recipients,
      subject: `${actionDetails.label} — ${location.name}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px"><h2>${actionDetails.emoji} ${escapeHtml(actionDetails.label)}</h2>${details}<p style="color:#64748b">Sent by Lakeside Laundromat Bin Service</p></div>`,
    }),
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function handleBinLocation(request, env, origin) {
  const url = new URL(request.url);
  const location = findLocation(
    env,
    normalizeField(url.searchParams.get("location")),
    normalizeField(url.searchParams.get("token")),
  );

  if (!location) {
    return jsonResponse({ error: "This bin-service link is not valid." }, 404, origin);
  }

  return jsonResponse({ id: location.id, name: location.name }, 200, origin);
}

async function handleBinEvent(request, env, origin) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request." }, 400, origin);
  }

  const location = findLocation(
    env,
    normalizeField(payload.location),
    normalizeField(payload.token),
  );
  const action = normalizeField(payload.action);
  const binCount = Number(payload.binCount);
  const submittedBy = normalizeField(payload.submittedBy).slice(0, 80);
  const note = normalizeField(payload.note).slice(0, 500);

  if (!location) {
    return jsonResponse({ error: "This bin-service link is not valid." }, 404, origin);
  }
  if (!BIN_ACTIONS[action]) {
    return jsonResponse({ error: "Choose a valid bin update." }, 400, origin);
  }
  if (!Number.isInteger(binCount) || binCount < 1 || binCount > 5) {
    return jsonResponse({ error: "Choose a valid number of bins (1–5)." }, 400, origin);
  }

  const occurredAt = new Date();
  let discordResult;
  let emailResult;
  try {
    [discordResult, emailResult] = await Promise.all([
      sendBinDiscord(env, location, action, binCount, submittedBy, note, occurredAt),
      sendBinEmail(env, location, action, binCount, submittedBy, note, occurredAt),
    ]);
  } catch (error) {
    console.error("Bin notification request failed", error);
    return jsonResponse(
      { error: "The update could not be sent. Please try again." },
      502,
      origin,
    );
  }

  if (!discordResult.ok || !emailResult.ok) {
    console.error("Bin notification failure", {
      discordStatus: discordResult.status,
      emailStatus: emailResult.status,
      location: location.id,
      action,
    });
    return jsonResponse(
      { error: "The update could not be sent. Please try again." },
      502,
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      message: `${BIN_ACTIONS[action].label} recorded for ${location.name}.`,
    },
    200,
    origin,
  );
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

    if (request.method === "GET" && url.pathname === "/api/bins/location") {
      return handleBinLocation(request, env, origin);
    }

    if (request.method === "POST" && url.pathname === "/api/bins/events") {
      return handleBinEvent(request, env, origin);
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
