/* ==========================================================================
   AquaBill JO — Early Theme Initialization

   تطبيق فوري للوضع الفاتح/الداكن المحفوظ مسبقاً (إن وُجد) قبل رسم الصفحة،
   لتفادي "وميض" ظهور الوضع الافتراضي ثم تبديله.

   يعتمد هذا الملف على APP_CONFIG المُعرَّف بـ config.js، وبالتالي يجب أن
   يُحمَّل بعد تحميل config.js وBEFORE رسم الصفحة.
   ========================================================================== */

(function initializeTheme() {
  try {
    var raw = localStorage.getItem(APP_CONFIG.storageKeys.settings);
    var settings = raw ? JSON.parse(raw) : null;
    if (settings && (settings.theme === 'dark' || settings.theme === 'light')) {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
  } catch (e) {
    // يُتجاهل بصمت — لن يمنع عرض الصفحة بالوضع الافتراضي
  }
})();
