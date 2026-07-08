self.addEventListener('install', (e) => {
    console.log('[SIGO] Service Worker Instalado');
});

self.addEventListener('fetch', (e) => {
    e.respondWith(fetch(e.request).catch(() => new Response("Estás offline. Verifica tu conexión.")));
});
