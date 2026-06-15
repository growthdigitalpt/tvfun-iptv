/* TV Fun — service worker mínimo (PWA instalável).
   Só faz cache do "shell" estático; NUNCA intercepta /api/, streams ou domínios externos. */
const CACHE = 'tvfun-shell-v1';
const SHELL = ['/index.html', '/style.css', '/app.js', '/supabase.js', '/logo.png', '/manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Só trata GET do mesmo domínio e fora de /api/ (deixa stream, API, Supabase e n8n irem direto à rede)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
