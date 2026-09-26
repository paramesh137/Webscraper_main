# EXTRACT/01 — Web Scraping Console

A small ScraperAPI front-end, safe to deploy publicly: the API key lives only
in a server-side environment variable, never in the browser.

## What changed from the original file

1. **API key removed from the client entirely.** The old version had the key
   hardcoded in an `<input>` in `index.html`, visible to anyone who viewed
   page source. It's now read from `process.env.SCRAPER_API_KEY` inside
   `api/scrape.js`, a Vercel serverless function that runs only on the server.
2. **Frontend calls `/api/scrape` (same-origin), not ScraperAPI directly.**
   The browser never sees the key or talks to `api.scraperapi.com` itself.
3. **Fixed an XSS bug.** The history list used to insert the scraped URL via
   `innerHTML`, so a crafted input like `<img src=x onerror=alert(1)>` typed
   into the URL field would execute as HTML/JS. It now uses `textContent` /
   DOM node creation, so input is always treated as plain text.
4. **Added basic abuse protection** on the serverless endpoint: a simple
   per-IP rate limit, an optional origin allow-list, and input validation on
   the target URL. See caveats below — this is a reasonable baseline, not a
   hardened solution.

## 🔑 First: rotate your ScraperAPI key

The key that was in the original file (`6a994d878a8e6f9cf2c09024cf8c1f39`)
was sitting in plain HTML and should be treated as already exposed.
Go to your ScraperAPI dashboard and **rotate/regenerate it** before doing
anything else. Use only the new key going forward.

## Deploying to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket), or run
   `vercel` from inside this folder with the Vercel CLI installed.
2. In the Vercel dashboard, go to your project →
   **Settings → Environment Variables** and add:
   - `SCRAPER_API_KEY` = your new ScraperAPI key (mark it as a "Secret")
   - *(optional but recommended)* `ALLOWED_ORIGIN` = your deployed URL,
     e.g. `https://your-project.vercel.app` — this stops other sites from
     calling your `/api/scrape` endpoint directly.
3. Deploy (or redeploy) — Vercel auto-detects the static `public/index.html`
   and the `api/scrape.js` serverless function, no extra config needed.
4. Visit your deployed URL and test a scrape.

## Local development

```bash
npm install -g vercel   # if you don't already have the CLI
vercel dev
```

Create a local `.env` file (do **not** commit it) with:

```
SCRAPER_API_KEY=your_key_here
```

## Security notes / caveats

- **Rate limiting is in-memory and per-instance.** Serverless functions can
  run as multiple concurrent instances, and instances reset on redeploy, so
  this limiter is a soft deterrent against casual abuse, not a hard cap. For
  real protection under load, use Vercel's built-in Firewall/rate-limit
  rules (Project Settings → Firewall) or a shared store like Upstash Redis.
- **Origin checking is not strong auth.** A non-browser client (e.g. `curl`)
  can set any `Origin`/`Referer` header it wants. If you need to restrict
  *who* can use this tool (not just *which website* calls it), add a simple
  shared-secret header or login check in `api/scrape.js`.
- **This proxies arbitrary URLs.** Anyone who can reach your `/api/scrape`
  endpoint can make your server (and your ScraperAPI quota) fetch any URL
  they choose. The rate limit and origin check reduce casual abuse; for a
  public-facing tool with real usage, consider adding authentication.
- **Never re-add the key to `public/index.html` or any client-side file.**
  Anything under `public/` or shipped in the page's JS is visible to every
  visitor.
