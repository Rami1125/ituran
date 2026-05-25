const CACHE_NAME = "sabanos-cache-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon.svg",
  "/src/index.css"
];

// Install Service Worker and cache core static shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Pre-caching core application shell");
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate & clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Cleaning up stale cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Smart Fetch Strategy: Cache-first fallback to network for assets, stale-while-revalidate for documents
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip caching for API queries or external websocket/maps integrations
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in the background to update cache (stale-while-revalidate)
        fetch(req).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
          }
        }).catch(() => {/* Ignore network errors of background fetches */});
        
        return cachedResponse;
      }

      return fetch(req).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }
        
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Offline Fallback for html pages
        if (req.mode === "navigate") {
          return caches.match("/");
        }
      });
    })
  );
});

// Native Push Event Listener for Mobile Push Notifications
self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { message: event.data.text() };
    }
  }

  const isCritical = 
    payload.alertType === "critical" || 
    payload.ptoState === "open" || 
    (payload.message && (payload.message.includes("קריטי") || payload.message.includes("PTO")));

  const title = isCritical ? "🚨 التنبيه الحرج | התרעה קריטית - SabanOS" : "SabanOS Fleet Log";
  
  const options = {
    body: payload.message || "חלה תחלופה או עדכון חדש במערך הכלים של איתורן.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    vibrate: isCritical ? [200, 100, 200, 100, 400] : [100],
    tag: isCritical ? "pto-alert" : "location-update",
    renotify: true,
    data: {
      url: payload.url || "/"
    },
    actions: [
      { action: "explore", title: "פתח ממשק ניהול Live" }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle Push Notification Clicking
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If window exists, focus it, otherwise open new one
      for (const client of windowClients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
