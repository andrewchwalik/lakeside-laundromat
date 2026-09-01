# Lakeside Laundromat

Lightweight static website foundation for a laundromat information site.

## Files

- `index.html`: main single-page site
- `styles.css`: site styling and responsive layout
- `script.js`: small mobile navigation and footer year behavior
- `bins/`: phone-friendly laundry-bin notification page opened by each location's QR code
- `weights/`: client-specific employee weight-entry page opened by each client's QR code
- `apps-script/weight-entry.gs`: Google Apps Script writer bound to the client weight tracker
- `workers/jobs-discord.js`: Cloudflare Worker for Discord, email, jobs, and Instagram requests

## Bin notification setup

The bin page uses a unique location ID and secret token in each QR-code URL:

`https://lakesidelaundromat.com/bins/?location=LOCATION_ID&token=LONG_RANDOM_TOKEN`

Configure these Cloudflare Worker secrets before deploying:

- `BIN_DISCORD_WEBHOOK_URL`: Discord webhook for bin notifications (falls back to `DISCORD_WEBHOOK_URL`)
- `RESEND_API_KEY`: API key for sending owner emails through Resend
- `BIN_EMAIL_FROM`: verified sender, such as `Lakeside Laundromat <bins@lakesidelaundromat.com>`
- `BIN_LOCATIONS_JSON`: JSON array of location records

Example `BIN_LOCATIONS_JSON` (use unique random tokens of at least 16 characters):

```json
[
  {
    "id": "location-one",
    "name": "Location One",
    "token": "replace-with-a-long-random-token",
    "emails": ["owner@example.com"],
    "discordWebhookUrl": "https://discord.com/api/webhooks/..."
  }
]
```

Set each value with `npx wrangler secret put SECRET_NAME`, then deploy with
`npx wrangler deploy`. Do not commit tokens, webhook URLs, API keys, or owner
email addresses to this repository.

## Weight entry setup

The weight page uses a unique client ID and token:

`https://lakesidelaundromat.com/weights/?client=CLIENT_ID&token=LONG_RANDOM_TOKEN`

The Worker requires these secrets:

- `WEIGHT_CLIENTS_JSON`: client IDs, names, sheet names, rates, bin behavior, and unique tokens
- `WEIGHT_APPS_SCRIPT_URL`: deployed Google Apps Script web-app URL
- `WEIGHT_WRITER_SECRET`: shared secret also saved in the Apps Script project's Script Properties

The Apps Script must be bound to or authorized for the tracker spreadsheet and deployed as a web app that executes as the owner. The writer inserts each new entry at row 4 and formats dates as `MM/dd/yyyy`.

## Hosting

This project is designed to deploy easily to GitHub Pages.
