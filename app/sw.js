// Service worker de SFL Farmhand (web). build.mjs lo copia a dist/sw.js cambiando c509e0b820 por la versión.
// - index.html (navegación): primero la red; sin red, la copia guardada (la app abre sin conexión).
// - app.js / app.css / iconos / manifest (el armazón, con ?v=versión): de la caché; se guardan al instalar.
// - data/*.json: stale-while-revalidate (responde con la copia y la actualiza en segundo plano).
// - Nada de otros orígenes (API del intermediario, imágenes del juego): pasa directo, sin guardarse aquí
//   (las imágenes quedan en la caché normal del navegador).
const VERSION = "c509e0b820";
// Prefijo de las cachés: "sfl" (web) o "sfl-beta" (beta en /app-beta/, mismo origen: no se pisan).
const PREFIX = "sfl";
const SHELL = `${PREFIX}-shell-${VERSION}`;
const DATA = `${PREFIX}-data-v1`;
const SHELL_FILES = [
  "./", `app.js?v=${VERSION}`, `app.css?v=${VERSION}`, "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => Promise.all(SHELL_FILES.map((f) => c.add(new Request(f, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(`${PREFIX}-shell-`) && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Solo lo de este sitio y dentro de su ámbito (la API y las imágenes del juego van directas).
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);

  if (req.mode === "navigate" || rel === "" || rel === "index.html") {
    event.respondWith(networkFirst(req));
  } else if (rel.startsWith("data/") && rel.endsWith(".json")) {
    event.respondWith(staleWhileRevalidate(event, req));
  } else if (SHELL_FILES.includes(rel + url.search) || rel.endsWith(".png")) {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put("./", res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match("./");
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(DATA);
  const cached = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req).then((res) => {
    if (res.ok) return cache.put(req, res.clone()).then(() => res);
    return res;
  });
  if (cached) {
    event.waitUntil(update.catch(() => {}));
    return cached;
  }
  return update;
}
