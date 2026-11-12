# Hosted Instagram feed

The header marquee uses Apify collection and Cloudflare KV image storage.
Website hosting, jobs submissions, and laundry notifications are unchanged.

## Accounts and resources

- Instagram: https://www.instagram.com/thewashcomp/
- Apify account: thewashcompany (Free, $5 monthly credit).
- Actor: apify/instagram-scraper (`shu8hvrXbJbY3Eb9W`).
- Saved task: `ax1BqVsgeKFG4LyBG` (Lakeside Instagram Feed).
- Schedule: `c4x4k7AR5PfVamSXx`.
- Cloudflare account: andrew@wash.ooo, `44e5761c07f2d2b065b5ca9ecee6539a` (Workers Free).
- Worker: https://lakeside-instagram.andrew-4e5.workers.dev
- Feed: `/feed.json`; cached images: `/media/<shortcode>/<run-id>`; status: `/health`.
- KV: `f711dfe1ca66477287629cb9b704929e`, binding `CACHE`.
- Configuration: `workers/instagram/wrangler.toml`.
- Encrypted secret: `APIFY_TOKEN`, restricted to this task's List runs and default run storage reads. No run-start permission.

## Operation

The saved task requests ten posts with parent data. Apify can return fewer
eligible posts; the initial successful collection returned five. Posts are
filtered by owner or collaborator, then sorted by timestamp. Video posts use
their poster image and open Instagram when clicked.

The production schedule is `0 2,14 * * *`, UTC, with a 120-second timeout,
$0.03 maximum charge per run, overlap prevention, and configuration-error
notifications enabled. It runs without a visitor, computer, or Instagram login.
Pause collection using Disable on the Apify schedule page:
https://console.apify.com/schedules/c4x4k7AR5PfVamSXx

Cloudflare checks completed task runs when the feed is requested, at most once
per 15 minutes. It never starts a run. Images are downloaded and validated
before the feed is published. The current and previous generations remain
cached. Upstream failures leave the last good feed intact and appear in health
status and Worker logs. A shared 24-second upstream deadline fits the background
refresh lifetime. Initial collection is awaited before a feed is served.

## Free-plan budget

At the current actor price of $2.70 per 1,000 results, 62 ten-post runs would
cost approximately $1.674/month, plus tests and other account usage. The first
successful five-post run displayed $0.014; one initial timeout displayed $0.000.
The run cap is a safeguard, not a monthly usage forecast. Keep the account Free
and review actual usage in Apify Billing; do not enable paid overages.

Cloudflare KV Free includes 100,000 reads/day, 1,000 writes/day, and 1 GB storage.
Each uncached media request reads one KV key; browsers cache media for five
minutes. Feed requests also read cached metadata, so visitor traffic counts
toward these limits. Exceeding Free limits can make requests fail. With ten
images and two retained generations, image storage is bounded at approximately
100 MB (usually much smaller). Failed incomplete refreshes clean up staged media
while preserving the last published feed.

## Deployment and checks

Verified on November 12, 2026:
- Manual collection and schedule Run now both succeeded.
- Clock-triggered run `da5vyW6BrPWQOFUpj` started at 17:09 UTC and succeeded
  at 17:10:03 UTC with five posts. Its exact charge was $0.0135.
- Cloudflare ingested that run at 17:10:28 UTC.
- The temporary single-run test cron was restored to `0 2,14 * * *`.
- Four successful setup/test runs total $0.054; one timeout cost $0.
- All five cached images load, post links open new tabs, and the 390px mobile
  viewport has no horizontal overflow. Feed/media HTTP 200 and production CORS
  were verified. Eight automated safety and fallback tests pass.

Confirm `npx wrangler whoami` shows andrew@wash.ooo, then use:

```
node --test workers/instagram/worker.test.mjs
npx wrangler deploy --config workers/instagram/wrangler.toml
```

No credentials are stored in repository files. Update secrets using the
Cloudflare dashboard or Wrangler's protected secret input, never command-line
arguments. Confirm feed and image HTTP 200 responses, allowed-origin CORS,
mobile layout, and Instagram destinations after deployment.

## Rollback

The original RSS.app-backed Worker remains available at:
https://lakeside-laundromat-jobs.chwalik.workers.dev/api/instagram-feed

To roll back the frontend, restore that `data-feed-url` in `index.html`, commit,
and push. The original Worker still contains the RSS.app route to support
rollback; the replacement Worker has no RSS.app dependency. Do not cancel
RSS.app automatically. Check other sites before canceling the subscription.

## References

- https://apify.com/apify/instagram-scraper
- https://developers.cloudflare.com/kv/platform/limits/
- https://developers.cloudflare.com/kv/platform/pricing/

Anonymous Instagram collection can change or fail. Monitor health and Apify
schedule results; cached content protects the site during upstream failures.
