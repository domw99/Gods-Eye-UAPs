/**
 * Service worker: makes the app installable and quick to reopen.
 * - Pages: network first, so a new deploy shows at once; the cached copy
 *   is used offline, or when the network hasn't answered within a few
 *   seconds (a poor connection shouldn't leave the app waiting).
 * - Hashed build files (assets/): cache first, they never change.
 * - Everything else from this site (Cesium, data, icons): served from the
 *   cache and refreshed in the background.
 * Other sites (map tiles, APIs, archive.org) are left to the network.
 */
const PAGES = 'gods-eye-pages-v1';
const FILES = 'gods-eye-files-v1';
const PATIENCE = 5000; // ms to wait for the network before showing a saved page

/** Store a copy. Clone now: the page reads the original's body straight away. */
function keep(cache, req, res) {
  const copy = res.clone();
  caches.open(cache).then((c) => c.put(req, copy)).catch(() => {});
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gods-eye-') && k !== PAGES && k !== FILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    const network = fetch(req).then((res) => {
      if (res.ok) keep(PAGES, req, res);
      return res;
    });
    event.waitUntil(network.catch(() => {})); // a late answer is still saved for next time
    // Only the app itself falls back to the saved app; a case page or the open data waits for its own copy.
    const isApp = url.pathname === new URL('./', self.location.href).pathname;
    const saved = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (isApp ? caches.match('./', { ignoreSearch: true }) : undefined));
    const tooSlow = new Promise((resolve) => setTimeout(resolve, PATIENCE, null));
    event.respondWith(
      Promise.race([network, tooSlow]).then(
        (res) => res || saved().then((hit) => hit || network), // nothing saved: keep waiting
        () => saved().then((hit) => hit || network),
      ),
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) keep(FILES, req, res);
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) keep(FILES, req, res);
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
