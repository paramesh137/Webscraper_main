// api/scrape.js
//
// This serverless function is the ONLY place the ScraperAPI key is used.
// It reads the key from an environment variable (never from the client),
// forwards the scrape request, and returns the result to the browser.
//
// Set SCRAPER_API_KEY in Vercel: Project Settings -> Environment Variables.

// --- extremely simple in-memory rate limiter -------------------------------
// Serverless instances are ephemeral and multiple may run concurrently, so
// this is a soft speed bump against casual abuse/scripted hammering, NOT a
// strong guarantee. For real protection at scale, use Vercel's Edge Config
// / Upstash Redis rate limiting, or put this behind Vercel's built-in
// Firewall / rate limit rules (Project Settings -> Firewall).
const WINDOW_MS = 60_000;   // 1 minute window
const MAX_REQUESTS = 10;    // max requests per IP per window
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

// Basic allow-list check so the endpoint isn't trivially scriptable from
// arbitrary third-party sites. This is NOT strong auth (headers can be
// spoofed by a non-browser client) — it just stops casual cross-site abuse.
// Set ALLOWED_ORIGIN in Vercel env vars to your deployed domain, e.g.
// "https://your-project.vercel.app". Leave unset to allow any origin.
function isAllowedOrigin(req) {
  const allowed = process.env.ALLOWED_ORIGIN;
  if (!allowed) return true; // no restriction configured
  const origin = req.headers.origin || req.headers.referer || '';
  return origin.startsWith(allowed);
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }

  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing SCRAPER_API_KEY configuration.' });
  }

  const { url, autoparse, country_code, render, premium } = req.query;

  if (!url || Array.isArray(url) || !isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'A valid target url query param is required.' });
  }

  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('url', url);
  if (autoparse === 'true') params.set('autoparse', 'true');
  if (typeof country_code === 'string' && country_code) params.set('country_code', country_code);
  if (render === 'true') params.set('render', 'true');
  if (premium === 'true') params.set('premium', 'true');

  try {
    const upstream = await fetch('https://api.scraperapi.com/?' + params.toString());
    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    return res.send(text);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed: ' + (err.message || 'unknown error') });
  }
}
