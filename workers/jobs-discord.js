const ALLOWED_ORIGINS = new Set([
  "https://lakesidelaundromat.com",
  "https://www.lakesidelaundromat.com",
  "https://andrewchwalik.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

function buildCorsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    if (request.method !== "POST" || url.pathname !== "/api/jobs") {
      return jsonResponse({ error: "Not found." }, 404, origin);
    }

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse({ error: "Origin not allowed." }, 403, origin);
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
