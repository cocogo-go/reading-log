const CACHE_NAME = "reading-log-v32";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/css/styles.css",
  "./src/js/app.js",
  "./src/js/store.js",
  "./src/js/api.js",
  "./src/js/kdc.js",
  "./src/js/dateUtils.js",
  "./src/js/googleBooksApi.js",
  "./src/js/inAppBrowser.js",
  "./src/js/views/settings.js",
  "./src/js/views/home.js",
  "./src/js/views/shelf.js",
  "./src/js/views/add.js",
  "./src/js/views/bookCard.js",
  "./src/js/views/bookDetail.js",
  "./src/js/views/underline.js",
  "./src/js/views/dietChart.js",
  "./src/js/views/recommend.js",
  "./src/js/views/interestMap.js",
  "./src/js/views/onboarding.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./assets/og-image.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 정보나루 API 등 외부 API는 캐시하지 않고 네트워크 우선으로 통과시킨다.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
