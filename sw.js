// Crater Weather service worker — tekee sovelluksesta asennettavan (PWA)
// ja tarjoaa kevyen offline-välimuistin sovelluksen staattisille tiedostoille.
const CACHE = "crater-v3";

// Sääpalvelut: näitä ei koskaan tallenneta välimuistiin (ennusteet vanhenevat).
const FORECAST_HOSTS = ["api.met.no", "api.open-meteo.com"];

// Sovelluksen "kuori" — suhteelliset polut, jotta toimii GitHub Pagesin
// alipolussa (/CraterWeather/).
const ASSETS = [
  "./",
  "./index.html",
  "./surfseeker.css",
  "./surfseeker.js",
  "./spots.geojson",
  "./craterweather.jpg",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Sää on aina haettava verkosta (ei välimuistia ennusteille).
  if (FORECAST_HOSTS.some((h) => url.hostname.endsWith(h))) return;

  // Cache-first: palautetaan välimuistista jos löytyy, muuten verkosta
  // (ja talletetaan samalla seuraavaa kertaa varten).
  event.respondWith(
    caches.match(req).then((cached) => {
      const fromNet = fetch(req)
        .then((res) => {
          if (res && res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fromNet;
    }),
  );
});
