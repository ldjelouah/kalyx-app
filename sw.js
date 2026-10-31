/* Kalyx — service worker : coquille de l'app en cache d'abord, pronostics réseau d'abord
   (hors ligne : la dernière copie). Repris de deuce. Changer CACHE à chaque changement
   de la coquille, sinon les téléphones gardent l'ancienne. */
const CACHE = "kalyx-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const save = (req, res) => {
  if (res && res.ok && new URL(req.url).origin === self.location.origin) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.includes("/data/")) {
    event.respondWith(fetch(req).then((r) => save(req, r)).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req).then((r) => save(req, r)).catch(() => cached);
      return cached || network;
    })
  );
});
