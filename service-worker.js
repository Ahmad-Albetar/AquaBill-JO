/* ==========================================================================
   AquaBill JO — حاسبة فاتورة المياه الأردنية — Service Worker
   يقوم بتخزين كل ملفات المشروع مؤقتاً (Cache) عند أول زيارة، بحيث تعمل
   الأداة بالكامل حتى بدون اتصال بالإنترنت في الزيارات اللاحقة.
   ========================================================================== */

/* رقم إصدار الكاش — يجب أن يطابق APP_CONFIG.cacheVersion بملف config.js.
   غيّروا القيمتين معاً عند أي تحديث مستقبلي للملفات، حتى يُجبر المتصفح على
   تحميل النسخة الجديدة بدل القديمة المخزّنة. */
const CACHE_NAME = 'aquabill-jo-v9.3';

/* قائمة كل الملفات المطلوبة لعمل الأداة بدون إنترنت.
   ملاحظة: نخزّن النسخ المُصغَّرة (.min) لأنها الملفات الفعلية التي يحمّلها
   index.html بالإنتاج؛ الملفات المصدرية (config.js/script.js/style.css)
   تبقى بالمستودع للتعديل فقط ولا حاجة لتخزينها بالكاش. */
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './script.js',
  './manifest.webmanifest',
  './favicon.ico',
  './images/favicon.svg',
  './images/favicon-16.png',
  './images/favicon-32.png',
  './images/apple-touch-icon.png',
  './images/android-chrome-192.png',
  './images/android-chrome-512.png',
  './images/og-image.png',
  './images/logo.png',
  './images/icon-192.png',
  './images/icon-512.png'
];

/* ---------------------------------------------------------------------------
   حدث التثبيت (install): يُشغَّل مرة واحدة عند تسجيل الـ Service Worker،
   ويقوم بتنزيل كل الملفات أعلاه وتخزينها بالكاش.
   -------------------------------------------------------------------------*/
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

/* ---------------------------------------------------------------------------
   حدث التفعيل (activate): يحذف أي نسخ كاش قديمة من إصدارات سابقة،
   للحفاظ على تحديث الملفات المخزّنة دون تراكم نسخ غير مستخدمة.
   -------------------------------------------------------------------------*/
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------------------------------------------------------------------------
   حدث الجلب (fetch): يعترض كل طلبات الشبكة.
   الاستراتيجية: "الكاش أولاً، ثم الشبكة" (Cache First, Fallback to Network)
   - إن وُجد الملف بالكاش، يُعاد مباشرة (سريع، ويعمل بدون إنترنت)
   - إن لم يوجد، يُطلب من الشبكة، ويُخزَّن نسخة منه بالكاش للمرة القادمة
   -------------------------------------------------------------------------*/
self.addEventListener('fetch', (event) => {
  // نتجاهل الطلبات لغير GET (مثل طلبات الخطوط الخارجية القابلة للتغيير) بأمان
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((networkResponse) => {
          // تخزين نسخة من الاستجابة بالكاش لطلبات لاحقة (فقط للطلبات الناجحة من نفس الأصل)
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            event.request.url.startsWith(self.location.origin)
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // في حال فشل الشبكة تماماً (بدون إنترنت) ولم يوجد بالكاش،
          // نعيد صفحة index.html كحل احتياطي للتصفح الأساسي
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
