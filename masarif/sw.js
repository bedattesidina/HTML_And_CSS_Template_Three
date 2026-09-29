/* ==========================================================================
   sw.js — عامل الخدمة: يجعل التطبيق يعمل بدون إنترنت
   الاستراتيجية: هيكل التطبيق يُخزَّن عند التثبيت ويُقدَّم من الذاكرة أولًا،
   مع تحديث في الخلفية (stale-while-revalidate) حتى لا يبقى المستخدم على نسخة قديمة.
   ========================================================================== */
'use strict';

var VERSION = 'masarif-v1';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/format.js',
  './js/db.js',
  './js/ui.js',
  './js/charts.js',
  './js/app.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // addAll يفشل كله إن فشل ملف واحد، فنضيف كل ملف على حدة
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // لا نتدخّل في الطلبات الخارجية

  // التنقّل: الشبكة أولًا ثم الصفحة المخزّنة عند انقطاع الإنترنت
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match('./index.html').then(function (r) {
          return r || new Response('التطبيق غير متاح دون إنترنت الآن.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || fresh;
    })
  );
});

// رسالة من الصفحة لتفعيل نسخة جديدة فورًا
self.addEventListener('message', function (event) {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
