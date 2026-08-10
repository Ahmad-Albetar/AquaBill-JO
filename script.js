/* ==========================================================================
   AquaBill JO — حاسبة فاتورة المياه الأردنية — ملف المنطق (JavaScript)
   ------------------------------------------------------------------------
   يعتمد هذا الملف على الكائن APP_CONFIG المُعرَّف بملف config.js (يجب أن
   يُحمَّل قبل هذا الملف بـ index.html).

   الوحدات المنطقية بهذا الملف:
     1. ERROR LOGGING     → تسجيل أخطاء العميل محلياً دون أي خادم خارجي
     2. STORAGE            → طبقة موحّدة للقراءة/الكتابة بالتخزين المحلي
     3. VALIDATION          → التحقق من صحة مدخلات المستخدم
     4. CALCULATION ENGINE  → دوال حساب الفاتورة (لم تتغيّر نتائجها إطلاقاً)
     5. UI RENDERING         → بناء جدول التعرفة وتحديث نتائج الواجهة
     6. LOCK FEATURE          → قفل/فتح تعديل الأسعار برمز سري
     7. THEME TOGGLE           → التبديل اليدوي بين الوضع الفاتح والداكن
     8. EXPORT / IMPORT        → تصدير واستيراد الإعدادات كملف JSON
     9. SCROLL EFFECTS       → شريط التقدم والظهور التدريجي للبطاقات
     10. INITIALIZATION       → التشغيل الأولي عند تحميل الصفحة
     11. SERVICE WORKER       → تسجيل العمل بدون إنترنت (PWA)
     12. PWA INSTALL PROMPT   → إشعار "تثبيت التطبيق" على الهاتف
   ========================================================================== */

'use strict';


const tiers = APP_CONFIG.tiers.map((t) => ({ ...t }));

let deferredInstallPrompt = null;


/* ==========================================================================
   1. ERROR LOGGING — تسجيل أخطاء العميل محلياً
   ------------------------------------------------------------------------
   عند حدوث أي خطأ JavaScript غير متوقع، يُسجَّل محلياً بالمتصفح (بدون أي
   خادم خارجي أو اتصال إنترنت)، ولا يُقاطع تجربة المستخدم إطلاقاً. يفيد هذا
   عند تشخيص مشكلة أبلغ عنها مستخدم لاحقاً (يمكنه نسخ السجل من وحدة التحكم).
   ========================================================================== */

const MAX_LOG_ENTRIES = 20;

/**
 * logClientError
 * يخزّن خطأ واحد بقائمة محلية محدودة الحجم (آخر 20 خطأ فقط، لتفادي تضخم
 * التخزين المحلي بمرور الوقت).
 * @param {string} message - وصف الخطأ
 * @param {string} [context] - أين حدث الخطأ (اسم الدالة مثلاً)
 */
function logClientError(message, context) {
  try {
    const key = APP_CONFIG.storageKeys.errorLog;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({
      message: String(message),
      context: context || 'unknown',
      time: new Date().toISOString(),
      version: APP_CONFIG.version,
    });
    // الاحتفاظ بآخر MAX_LOG_ENTRIES فقط
    const trimmed = existing.slice(-MAX_LOG_ENTRIES);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (e) {
    // فشل التسجيل نفسه لا يجب أن يكسر التطبيق — يُتجاهل بصمت
  }
}

/* التقاط أي خطأ JavaScript غير متوقع بالصفحة بالكامل، بدون مقاطعة المستخدم */
window.addEventListener('error', (e) => {
  logClientError(e.message, e.filename ? `${e.filename}:${e.lineno}` : 'global');
});


/* ==========================================================================
   2. STORAGE — طبقة موحّدة للتخزين المحلي
   ------------------------------------------------------------------------
   كل إعدادات المستخدم (الوضع الفاتح/الداكن، تعديلات التعرفة إن وُجدت)
   تُحفظ ضمن كائن واحد بمفتاح واحد (APP_CONFIG.storageKeys.settings) بدل
   مفاتيح متفرقة، لسهولة التوسعة مستقبلاً (إعدادات إضافية) وللتصدير/الاستيراد.
   ========================================================================== */

const DEFAULT_SETTINGS = {
  theme: null,           // 'light' | 'dark' | null (يتبع نظام التشغيل)
  tariffOverride: null,  // مصفوفة تعرفة مخصصة إن عدّلها المستخدم، وإلا null
};

/**
 * loadSettings
 * يقرأ كائن الإعدادات المحفوظ محلياً، ويدمجه مع القيم الافتراضية (بحيث لا
 * ينكسر التطبيق لو أُضيف إعداد جديد مستقبلاً ولم يكن موجوداً بنسخة قديمة محفوظة).
 * @returns {object} كائن الإعدادات الكامل
 */
function loadSettings() {
  try {
    const raw = localStorage.getItem(APP_CONFIG.storageKeys.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    logClientError(e.message, 'loadSettings');
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * saveSettings
 * يحفظ كائن الإعدادات كاملاً بالتخزين المحلي.
 * @param {object} settings - كائن الإعدادات المطلوب حفظه
 */
function saveSettings(settings) {
  try {
    localStorage.setItem(APP_CONFIG.storageKeys.settings, JSON.stringify(settings));
  } catch (e) {
    logClientError(e.message, 'saveSettings');
  }
}

/**
 * updateSetting
 * يحدّث حقلاً واحداً فقط بكائن الإعدادات دون المساس بباقي الحقول.
 * @param {string} key - اسم الحقل
 * @param {*} value - القيمة الجديدة
 */
function updateSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
}


/* ==========================================================================
   3. VALIDATION — التحقق من صحة مدخلات المستخدم
   ------------------------------------------------------------------------
   حقول الإدخال أصلاً من نوع number بحد أدنى (min) بالـ HTML، لكن هذه
   الدالة تحمي أيضاً من قيم سالبة أو غير رقمية قد تصل بطرق أخرى (مثل اللصق
   اليدوي)، فتُعيد دائماً رقماً صالحاً غير سالب.
   ========================================================================== */

/**
 * sanitizeNumber
 * يحوّل أي مُدخَل إلى رقم غير سالب صالح، أو يعيد قيمة افتراضية إن كان غير صالح.
 * @param {*} value - القيمة الخام من حقل الإدخال
 * @param {number} fallback - القيمة الافتراضية إن فشل التحويل
 * @returns {number}
 */
function sanitizeNumber(value, fallback = 0) {
  const n = parseFloat(value);
  if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return fallback;
  return n;
}


/* ==========================================================================
   4. CALCULATION ENGINE — دوال حساب الفاتورة
   ------------------------------------------------------------------------
   ⚠️ منطق الحساب هنا مطابق تماماً لكل النسخ السابقة ولم يُغيَّر بأي شكل.
   ========================================================================== */

/**
 * costFor
 * يحسب التكلفة التراكمية (تصاعدية) لعدد أمتار "n" لحقل معين ("water" أو "sewage").
 * يمر على كل شريحة بالترتيب، ويحسب فقط الكمية الواقعة ضمن كل شريحة، مع معاملة
 * الشريحة الأولى (flat) كرسم ثابت لا يتغير بتغير الكمية ضمنها.
 * @param {number} n - إجمالي الاستهلاك بالمتر المكعب
 * @param {'water'|'sewage'} field - الحقل المطلوب حسابه
 * @returns {number} التكلفة الإجمالية لهذا الحقل بالدينار
 */
function costFor(n, field) {
  let cost = 0;
  let prevCap = 0;

  for (const t of tiers) {
    const cap = t.upTo;

    if (t.flat) {
      cost += t[field];
      prevCap = cap;
      if (n <= cap) break;
      continue;
    }

    if (n > prevCap) {
      const units = Math.min(n, cap) - prevCap;
      cost += units * t[field];
    }
    prevCap = cap;
    if (n <= cap) break;
  }

  return cost;
}


/* ==========================================================================
   5. UI RENDERING — بناء جدول التعرفة وتحديث نتائج الواجهة
   ========================================================================== */

/**
 * renderTariffTable
 * يبني صفوف جدول التعرفة داخل <tbody> ديناميكياً من مصفوفة tiers.
 */
function renderTariffTable() {
  const tbody = document.querySelector('#tariffTable tbody');
  tbody.innerHTML = tiers.map((t, i) => `
    <tr>
      <td>${t.label}</td>
      <td><input type="number" class="tariff-input" data-tier="${i}" data-field="water" value="${t.water}" step="0.01" min="0" readonly></td>
      <td><input type="number" class="tariff-input" data-tier="${i}" data-field="sewage" value="${t.sewage}" step="0.01" min="0" readonly></td>
    </tr>`
  ).join('');
}

/**
 * onTariffEdit
 * يُستدعى عند تعديل قيمة بجدول التعرفة يدوياً (بعد فتح القفل). يحدّث
 * مصفوفة tiers، يحفظها كإعداد مخصص، ثم يعيد حساب النتائج فوراً.
 * @param {HTMLInputElement} el - حقل الإدخال الذي تم تعديله
 */
function onTariffEdit(el) {
  const i = +el.dataset.i;
  const f = el.dataset.f;
  tiers[i][f] = sanitizeNumber(el.value, tiers[i][f]);
  updateSetting('tariffOverride', tiers);
  calcAll();
}

/**
 * calcAll
 * الدالة الرئيسية: تُستدعى عند أي تغيير بالمدخلات (oninput)، وتحدّث كل نتائج الصفحة:
 *   - تكلفة المياه والصرف الصحي والإجمالي
 *   - تكلفة المتر القادم (الهامشية)
 *   - شارة حالة الاستهلاك (آمن / متوسط / مرتفع)
 *   - مقارنة العداد بصهريج المياه والتوصية الأوفر
 */
// --- 1. دالة حساب الخطوة 3 (الصهريج) فقط لمنع الومضة ---
// --- 1. دالة حساب الصهريج فقط (الخطوة 3) ---
function calcTankerOnly() {
  const tankerPriceInput = parseFloat(document.getElementById('tankerPrice').value) || 0;
  const tankerQtyInput = parseFloat(document.getElementById('tankerQty').value) || 0;
  const tankerPerM3 = (tankerPriceInput > 0 && tankerQtyInput > 0) ? (tankerPriceInput / tankerQtyInput) : 0;

  const currSymbol = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.currencyLabelAr) 
    ? APP_CONFIG.currencyLabelAr[0] 
    : 'د.أ';

  const tankerMarginalElem = document.getElementById('tankerMarginal');
  if (tankerMarginalElem) {
    tankerMarginalElem.textContent = tankerPerM3 > 0 
      ? `${tankerPerM3.toFixed(2)} ${currSymbol}` 
      : `0.00 ${currSymbol}`;
  }

  // جلب كلفة المتر الهامشي للشبكة من الواجهة إن وجدت
  const networkMarginalElem = document.getElementById('networkMarginal');
  const networkMarginal = networkMarginalElem ? (parseFloat(networkMarginalElem.textContent) || 0) : 0;

  const boxNetwork = document.getElementById('boxNetwork');
  const boxTanker = document.getElementById('boxTanker');
  const recommendHint = document.getElementById('recommendHint');

  if (boxNetwork && boxTanker && recommendHint) {
    if (tankerPerM3 > 0) {
      if (networkMarginal < tankerPerM3) {
        if (!boxNetwork.classList.contains('win')) {
          boxNetwork.classList.add('win');
          boxTanker.classList.remove('win');
        }
        recommendHint.textContent = 'الأوفر: سحب المتر الإضافي من العداد بدل طلب صهريج مياه.';
      } else {
        if (!boxTanker.classList.contains('win')) {
          boxTanker.classList.add('win');
          boxNetwork.classList.remove('win');
        }
        recommendHint.textContent = 'الأوفر هنا: صهريج المياه أرخص من تجاوز الشريحة الحالية.';
      }
    } else {
      boxNetwork.classList.remove('win');
      boxTanker.classList.remove('win');
      recommendHint.textContent = 'أدخل سعر وسعة الصهريج للمقارنة مع العداد.';
    }
  }
}

// --- 2. دالة الحسابات الشاملة (calcAll) ---
// حالة الحقل الفارغ (الحالة الافتراضية عند فتح الموقع)
function calcAll() {
  const consumptionInput = document.getElementById('consumption');
  const tankerCapInput = document.getElementById('tankerCap') || document.getElementById('tankerQty');
  const tankerPriceInput = document.getElementById('tankerPrice');
  const warningElem = document.getElementById('warning-message');

  // 1. تقييد جميع الحقول بـ 3 خانات كحد أقصى (حتى 999)
  [consumptionInput, tankerCapInput, tankerPriceInput].forEach(input => {
    if (input && input.value && input.value.length > 3) {
      input.value = input.value.slice(0, 3);
    }
  });

  // 2. هــــذا هــو السطر المفقود الذي يسبب المشكلة (تعريف rawInput):
  const rawInput = consumptionInput ? consumptionInput.value.trim() : '';

  // 3. حالة الحقل الفارغ (لا يحسب ولا يظهر أي شريحة)
  if (rawInput === '') {
    if (warningElem) warningElem.style.display = 'none';

    document.getElementById('waterOut').textContent = '-';
    document.getElementById('sewageOut').textContent = '-';
    document.getElementById('totalOut').textContent = '-';

    const flatFeeHint = document.getElementById('flatFeeHint');
    if (flatFeeHint) flatFeeHint.style.display = 'none';

    document.getElementById('marginalHint').textContent = 'أدخل كمية الاستهلاك لمعرفة تكلفة المتر القادم.';

    const badge = document.getElementById('statusBadge');
    if (badge) badge.innerHTML = '';

    document.getElementById('networkMarginal').textContent = '-';
    document.getElementById('tankerMarginal').textContent = '-';
    return;
    } else {
    if (warningElem) warningElem.style.display = 'none';
  }

  // 4. الحسابات الطبيعية للعداد (من 0 إلى 500 م³)
  const n = sanitizeNumber(rawInput, 0);
  const water = costFor(n, 'water');
  const sewage = costFor(n, 'sewage');
  const total = water + sewage;

  document.getElementById('waterOut').textContent = `${water.toFixed(2)} ${APP_CONFIG.currencyLabelAr}`;
  document.getElementById('sewageOut').textContent = `${sewage.toFixed(2)} ${APP_CONFIG.currencyLabelAr}`;
  document.getElementById('totalOut').textContent = `${total.toFixed(2)} ${APP_CONFIG.currencyLabelAr}`;

  const flatFeeHint = document.getElementById('flatFeeHint');
  if (flatFeeHint) {
    flatFeeHint.style.display = (n <= 6) ? 'inline-block' : 'none';
  }

  const nextWater = costFor(n + 1, 'water') - water;
  const nextSewage = costFor(n + 1, 'sewage') - sewage;
  const marginal = nextWater + nextSewage;

  document.getElementById('marginalHint').textContent =
    `المتر القادم (رقم ${Math.ceil(n) + 1}) سيكلفك تقريباً ${marginal.toFixed(2)} ${APP_CONFIG.currencyLabelAr} إضافية.`;

  // 5. شارة تقييم الاستهلاك
  const badge = document.getElementById('statusBadge');
  if (badge) {
    let newHTML = '';
    if (n <= 6) {
      newHTML = '<span class="badge ok">💧 شريحة المقطوعية - استهلاك منزلي ممتاز</span>';
    } else if (n <= 12) {
      newHTML = '<span class="badge ok">🌿 استهلاك منزلي جيد جداً</span>';
    } else if (n <= 18) {
      newHTML = '<span class="badge ok">⚖️ استهلاك منزلي معتدل</span>';
    } else if (n <= 24) {
      newHTML = '<span class="badge warn">⚠️ استهلاك متوسط-مرتفع - تحقق من السبب</span>';
    } else if (n <= 50) {
      newHTML = '<span class="badge bad">🚨 استهلاك مرتفع - راجع التسريبات وأسباب الزيادة</span>';
    } else {
      newHTML = '<span class="badge critical">💥 تحذير: استهلاك مرتفع جداً! افحص العداد والتسريبات فوراً</span>';
    }
    badge.innerHTML = newHTML;
  }

  // 6. مقارنة الصهريج مع تحديد الحدود المنطقية
  document.getElementById('networkMarginal').textContent = `${marginal.toFixed(2)} ${APP_CONFIG.currencyLabelAr}`;

  const tankerPrice = parseFloat(tankerPriceInput?.value) || 0;
  const tankerQty = parseFloat(tankerCapInput?.value) || 0;

  const boxNetwork = document.getElementById('boxNetwork');
  const boxTanker = document.getElementById('boxTanker');
  const recommendHint = document.getElementById('recommendHint');

  // فحص الحدود المنطقية للصهريج (أقصى سعر 500 د.أ وأقصى سعة 100 م³)
  if (tankerPrice > 500 || tankerQty > 100) {
    document.getElementById('tankerMarginal').textContent = '-';
    boxNetwork?.classList.remove('win');
    boxTanker?.classList.remove('win');
    if (recommendHint) {
      recommendHint.textContent = '⚠️ السعر أو السعة المدخلة للصهريج غير منطقية (الأقصى: 100 م³ سعة / 500 د.أ سعر).';
    }
    return;
  }

  const tankerPerM3 = (tankerPrice > 0 && tankerQty > 0) ? (tankerPrice / tankerQty) : 0;

  document.getElementById('tankerMarginal').textContent = tankerPerM3 > 0 
    ? `${tankerPerM3.toFixed(2)} ${APP_CONFIG.currencyLabelAr}` 
    : `0.00 ${APP_CONFIG.currencyLabelAr}`;

  if (tankerPerM3 > 0) {
    if (marginal < tankerPerM3) {
      boxNetwork?.classList.add('win');
      boxTanker?.classList.remove('win');
      if (recommendHint) recommendHint.textContent = 'الأوفر: سحب المتر الإضافي من العداد بدل طلب صهريج مياه.';
    } else {
      boxTanker?.classList.add('win');
      boxNetwork?.classList.remove('win');
      if (recommendHint) recommendHint.textContent = 'الأوفر هنا: صهريج المياه أرخص من تجاوز الشريحة الحالية.';
    }
  } else {
    boxNetwork?.classList.remove('win');
    boxTanker?.classList.remove('win');
    if (recommendHint) recommendHint.textContent = 'أدخل سعر وسعة الصهريج للمقارنة مع العداد.';
  }
}
/* ==========================================================================
   7. THEME TOGGLE — التبديل اليدوي بين الوضع الفاتح والداكن
   ------------------------------------------------------------------------
   يُخزَّن اختيار المستخدم ضمن كائن الإعدادات الموحّد (راجع قسم STORAGE)
   ليبقى ثابتاً بعد إغلاق الصفحة. عند عدم وجود اختيار محفوظ، تتبع الصفحة
   تلقائياً إعداد نظام التشغيل (راجع قسم Dark Mode بـ style.css).
   ========================================================================== */

/**
 * toggleTheme
 * يُستدعى بزر التبديل بالترويسة. يحسب الوضع الحالي الفعلي (المحفوظ، أو
 * حسب نظام التشغيل إن لم يوجد شيء محفوظ)، ثم يبدّل إلى الوضع المقابل
 * ويحفظه، حتى يبقى ثابتاً بالزيارات القادمة.
 */
// دالة آمنة لتبديل الثيم والأيقونة دون كسر باقي الكود
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  // التحقق من وجود الزر قبل تغييره لعدم التسبب في خطأ كود
  const themeBtn = document.querySelector('.btn-theme-toggle') || document.getElementById('themeToggle');
 // استبدل السطر الخاص بالأيقونة بهذا السطر فقط:
  if (themeBtn) {
  themeBtn.textContent = newTheme === 'dark' ? '🌞' : '🌙';
  }
}
/* ==========================================================================
   8. EXPORT / IMPORT — تصدير واستيراد الإعدادات كملف JSON
   ------------------------------------------------------------------------
   يسمح بحفظ نسخة احتياطية من الإعدادات الحالية (الوضع، تعديلات التعرفة
   إن وُجدت) كملف JSON على الجهاز، واستعادتها لاحقاً أو نقلها لجهاز آخر.
   ========================================================================== */

/**
 * exportSettings
 * ينشئ ملف JSON يحتوي كل الإعدادات الحالية، ويبدأ تحميله تلقائياً بالمتصفح.
 */
function exportSettings() {
  try {
    const settings = loadSettings();
    const payload = {
      app: APP_CONFIG.appName,
      version: APP_CONFIG.version,
      exportedAt: new Date().toISOString(),
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aquabill-settings.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    logClientError(e.message, 'exportSettings');
    alert('تعذّر تصدير الإعدادات.');
  }
}
/**
 * importSettings
 * يقرأ ملف JSON اختاره المستخدم، ويستعيد منه الإعدادات (الوضع، وتعديلات
 * التعرفة إن وُجدت)، ثم يعيد رسم الواجهة فوراً بالقيم المستوردة.
 * @param {Event} event - حدث اختيار الملف من <input type="file">
 */
function importSettings(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
      saveSettings(settings);

      if (settings.theme) {
        document.documentElement.setAttribute('data-theme', settings.theme);
      }
      if (Array.isArray(settings.tariffOverride) && settings.tariffOverride.length === tiers.length) {
        settings.tariffOverride.forEach((t, i) => {
          tiers[i].water = sanitizeNumber(t.water, tiers[i].water);
          tiers[i].sewage = sanitizeNumber(t.sewage, tiers[i].sewage);
        });
        renderTariffTable();
      }
      calcAll();
    } catch (e) {
      logClientError(e.message, 'importSettings');
      alert('ملف الإعدادات غير صالح.');
    }
  };
  reader.readAsText(file);
}


/* ==========================================================================
   9. SCROLL EFFECTS — شريط التقدم والظهور التدريجي للبطاقات
   ------------------------------------------------------------------------
   تحسين تدريجي بحت (Progressive Enhancement): لا يوجد أي منطق حسابي هنا،
   فقط تأثيرات بصرية خفيفة. تُحترَم تفضيلات "تقليل الحركة" تلقائياً عبر
   CSS (راجع قسم Animations بـ style.css)، ولا تعتمد عليه أي وظيفة أساسية.
   ========================================================================== */

/**
 * initScrollProgress
 * يحدّث عرض شريط التقدم أعلى الشاشة تناسبياً مع موضع التمرير الحالي،
   بأداء مُحسَّن عبر requestAnimationFrame لتفادي إبطاء التمرير.
 */
function initScrollProgress() {
  const bar = document.getElementById('scrollProgress');
  if (!bar) return;

  let ticking = false;
  function update() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
  update();
}

/**
 * initFadeInCards
 * يراقب بطاقات الأقسام الأربعة، ويضيف كلاس "is-visible" بمجرد دخول كل
 * بطاقة نطاق الرؤية، لإحداث ظهور تدريجي لطيف. يتحقق أولاً من دعم
 * IntersectionObserver بالمتصفح؛ وإلا تبقى البطاقات مرئية كما هي (بلا كسر).
 */
function initFadeInCards() {
  const cards = document.querySelectorAll('.fade-in');
  if (!cards.length) return;

  if (!('IntersectionObserver' in window)) return; // بدون كسر أي شيء بالمتصفحات القديمة جداً

  cards.forEach((c) => c.classList.add('fade-init'));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  cards.forEach((c) => observer.observe(c));
}


/* ==========================================================================
   10. INITIALIZATION — التشغيل الأولي عند تحميل الصفحة
   ========================================================================== */

(function initApp() {
  // استعادة أي تعديل سابق على التعرفة كان المستخدم قد حفظه بجلسة سابقة
  const settings = loadSettings();
  if (Array.isArray(settings.tariffOverride) && settings.tariffOverride.length === tiers.length) {
    settings.tariffOverride.forEach((t, i) => {
      tiers[i].water = sanitizeNumber(t.water, tiers[i].water);
      tiers[i].sewage = sanitizeNumber(t.sewage, tiers[i].sewage);
    });
  }

  renderTariffTable();
  // calcAll();
  initScrollProgress();
  initFadeInCards();

  // مزامنة حالة aria-pressed لزر تبديل الوضع مع الوضع الفعلي الحالي عند التحميل
  // (إصلاح خلل وصولية: كانت تبقى "false" افتراضياً حتى لو كان الوضع محفوظاً داكناً فعلياً)
  const themeToggleBtn = document.getElementById('themeToggle');
  if (themeToggleBtn) {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDarkNow = currentTheme ? currentTheme === 'dark' : systemPrefersDark;
    themeToggleBtn.setAttribute('aria-pressed', String(isDarkNow));
  }

  // عرض رقم إصدار التطبيق بالتذييل
  const versionEl = document.getElementById('appVersion');
  if (versionEl) {
    versionEl.textContent = `${APP_CONFIG.appName} — الإصدار ${APP_CONFIG.version}`;
  }
})();


/* ==========================================================================
   11. SERVICE WORKER — تسجيل العمل بدون إنترنت (PWA)
   ------------------------------------------------------------------------
   يعمل فقط عند التصفح عبر HTTPS أو localhost (شرط أساسي من المتصفحات).
   ========================================================================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .catch((err) => {
        console.warn('تعذر تسجيل Service Worker:', err);
        logClientError(err.message || String(err), 'serviceWorker.register');
      });
  });
}


/* ==========================================================================
   12. PWA INSTALL PROMPT — إشعار "تثبيت التطبيق" على الهاتف
   ========================================================================== */

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallToast();
});

/** يُظهر إشعار "ثبّتوا الأداة" العائم أسفل الشاشة */
function showInstallToast() {
  const toast = document.getElementById('pwaToast');
  if (!toast) return;
  toast.classList.add('show');
}

/** يُخفي إشعار التثبيت (عند الضغط على "لاحقاً" أو بعد بدء التثبيت) */
function hideInstallToast() {
  const toast = document.getElementById('pwaToast');
  if (!toast) return;
  toast.classList.remove('show');
}

/** يُشغّل حوار تثبيت PWA الأصلي للمتصفح عند الضغط على زر "تثبيت" */
function installApp() {
  hideInstallToast();
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.finally(() => {
    deferredInstallPrompt = null;
  });
}
