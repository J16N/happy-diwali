// Service worker: keeps the site fresh, avoids needless requests, and lets
// it open offline.
//
// - Fingerprinted files (…?v=<content hash>, written by tools/stamp.mjs) can
//   never change, so they are served from the cache without asking the
//   server. When a new fingerprint of a file arrives, older ones are deleted.
// - Everything else (the page itself, unstamped files during development)
//   goes to the network first, revalidated with the server (a cheap 304 when
//   nothing changed), and falls back to the cache only when offline.
//
// GitHub Pages tells browsers to cache every file for 10 minutes; without
// this worker a visitor could get a mix of old and new files after a deploy.

const CACHE = 'diwali-greeting';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const isStamped = (url) => url.searchParams.has('v');
/** Unstamped files: one cache entry per path, whatever the query string. */
const plainKey = (url) => {
  const u = new URL(url);
  u.search = '';
  return u.toString();
};

async function fromNetwork(req, url, cache) {
  // A navigation request cannot be re-issued with options, so fetch by URL.
  const res = await fetch(url.toString(), { cache: 'no-cache', credentials: 'same-origin' });
  if (res.ok && res.type === 'basic') {
    const key = isStamped(url) ? url.toString() : plainKey(url);
    await cache.put(key, res.clone());
    if (isStamped(url)) {
      // Drop other fingerprints of the same file.
      for (const old of await cache.keys()) {
        const o = new URL(old.url);
        if (o.pathname === url.pathname && o.toString() !== key) cache.delete(old);
      }
    }
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (isStamped(url)) {
        const hit = await cache.match(url.toString());
        if (hit) return hit;
      }
      try {
        return await fromNetwork(req, url, cache);
      } catch (err) {
        const hit = (await cache.match(plainKey(url))) ?? (await cache.match(url.toString()));
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const home = await cache.match(plainKey(new URL('./', self.location)));
          if (home) return home;
        }
        throw err;
      }
    })(),
  );
});
