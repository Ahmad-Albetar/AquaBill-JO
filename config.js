/* ==========================================================================
   AquaBill JO — ملف الإعدادات المركزي (Config)
   ------------------------------------------------------------------------
   هذا الملف يجمع كل الثوابت والإعدادات بمكان واحد بدل تشتّتها بالكود،
   ليسهل تحديث اسم التطبيق أو رقم الإصدار أو أسعار الشرائح من مكان واحد
   فقط دون البحث بملفات متعددة.

   ⚠️ يجب تحميل هذا الملف بـ index.html قبل script.js (بنفس الترتيب
   الحالي)، لأن script.js يعتمد على الكائن APP_CONFIG المُعرَّف هنا.
   ========================================================================== */

const APP_CONFIG = {
  /* ---------- معلومات التطبيق العامة ---------- */
  appName: 'AquaBill JO',
  appNameAr: 'حاسبة فاتورة المياه الأردنية',
  version: '1.3.0',
  cacheVersion: 'aquabill-jo-v8',
  buildDate: '2026-07-31',
  currency: 'JOD',
  currencyLabelAr: 'دينار',
  country: 'JO',
  complaintsPhone: '117116',

  /* ---------- جدول التعرفة الرسمي (نفس القيم الأصلية دون أي تغيير) ---------- */
  tiers: [
    { label: '0-6 (مقطوعية)', upTo: 6,        water: 2.50, sewage: 0.23, flat: true },
    { label: '7-12',          upTo: 12,       water: 0.60, sewage: 0.15 },
    { label: '13-18',         upTo: 18,       water: 0.80, sewage: 0.50 },
    { label: '19-24',         upTo: 24,       water: 1.10, sewage: 0.70 },
    { label: '25-30',         upTo: 30,       water: 1.40, sewage: 0.85 },
    { label: '31-42',         upTo: 42,       water: 1.80, sewage: 0.95 },
    { label: 'فوق 42',        upTo: Infinity, water: 2.20, sewage: 1.20 },
  ],

  /* ---------- إعدادات افتراضية أخرى ---------- */
  defaultConsumption: 18,
  defaultTankerPrice: 11,
  defaultTankerQty: 3.5,
  editPin: '2580',

  /* ---------- مفاتيح التخزين المحلي (موحّدة بمكان واحد) ---------- */
  storageKeys: {
    settings: 'aquabill-settings',
    errorLog: 'aquabill-error-log',
  },
};

/* تجميد الكائن لمنع أي تعديل عرضي عليه أثناء التشغيل (الثوابت تبقى ثابتة) */
Object.freeze(APP_CONFIG);
Object.freeze(APP_CONFIG.tiers);
Object.freeze(APP_CONFIG.storageKeys);
