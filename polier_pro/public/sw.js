// ═══════════════════════════════════════════════════════════════════════════
// Polier Pro – Service Worker
// Strategie: Cache-First für Assets, Network-First für API-Calls
// ═══════════════════════════════════════════════════════════════════════════

// Bei jedem Release mit anheben (siehe config.yaml/package.json) — der
// Name bestimmt den Cache-Namen, und nur ein geänderter Name lässt den
// activate-Handler unten die alten, jetzt verwaisten Caches abräumen.
const APP_VERSION   = "polier-pro-v1.28.0";
const STATIC_CACHE  = `${APP_VERSION}-static`;
const DYNAMIC_CACHE = `${APP_VERSION}-dynamic`;
const IMG_CACHE     = `${APP_VERSION}-images`;

// Assets die beim Install sofort gecacht werden (App Shell)
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Diese URLs NIE cachen (immer live)
const NEVER_CACHE = [
  "supabase.co",
  "123erfasst.de",
  "open-meteo.com",
  "anthropic.com",
];

// ── Install: App Shell vorabladen ──────────────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn("[SW] Precache teilweise fehlgeschlagen:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: alte Caches aufräumen ───────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith("polier-pro-") && k !== STATIC_CACHE && k !== DYNAMIC_CACHE && k !== IMG_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Routing-Logik ───────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // 1. Nie-cachen: externe APIs immer live
  if (NEVER_CACHE.some(domain => url.hostname.includes(domain))) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: "Offline – API nicht erreichbar" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // 2. Bilder: Cache-First, dann Netz, dann Fallback
  if (request.destination === "image") {
    e.respondWith(
      caches.open(IMG_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          // Grau-Platzhalter wenn Bild offline nicht verfügbar
          return new Response(
            `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150">
              <rect width="200" height="150" fill="#2E3541"/>
              <text x="50%" y="50%" fill="#8A8F99" text-anchor="middle" dy=".3em" font-size="14">📷 Offline</text>
            </svg>`,
            { headers: { "Content-Type": "image/svg+xml" } }
          );
        }
      })
    );
    return;
  }

  // 3. Navigation (HTML): Network-First mit Offline-Fallback
  // cache:"no-store" erzwingt einen echten Netzwerk-Request statt einer
  // Antwort aus dem browsereigenen HTTP-Cache — sonst kann "Network-First"
  // trotzdem eine veraltete index.html liefern, wenn der HTTP-Cache sie
  // (v.a. im iOS-Standalone-PWA-Modus) noch als frisch genug einstuft.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request, { cache: "no-store" })
        .then(res => {
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Offline-Seite aus Static Cache
          return caches.match("/index.html");
        })
    );
    return;
  }

  // 4. JS/CSS/Fonts: Cache-First
  if (["script","style","font"].includes(request.destination)) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            caches.open(STATIC_CACHE).then(c => c.put(request, res.clone()));
          }
          return res;
        });
      })
    );
    return;
  }

  // 5. Alles andere: Network-First
  e.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          caches.open(DYNAMIC_CACHE).then(c => c.put(request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

// ── Push Notifications (Vorbereitung) ─────────────────────────────────────
self.addEventListener("push", (e) => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || "Polier Pro", {
      body:    data.body    || "",
      icon:    "/icons/icon-192.png",
      badge:   "/icons/icon-96.png",
      tag:     data.tag     || "polier-pro",
      data:    data.url     || "/",
      actions: data.actions || [],
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then(list => {
      const target = e.notification.data || "/";
      for (const client of list) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// ── Background Sync (Offline-Speicherung von Tagesberichten) ──────────────
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-tagesberichte") {
    e.waitUntil(syncTagesberichte());
  }
});

async function syncTagesberichte() {
  // Holt offline gespeicherte Berichte aus IndexedDB und sendet sie an Supabase
  // Implementierung in der App via Background Sync API
  console.log("[SW] Background Sync: Tagesberichte werden synchronisiert");
}
