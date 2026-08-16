# سياسة الأمان (Security Policy)

## الإبلاغ عن ثغرة أمنية
راجعوا `.well-known/security.txt` (وفق معيار [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)) للتواصل المباشر، أو افتحوا Issue على GitHub مباشرة.

## طبيعة المشروع من الناحية الأمنية
AquaBill JO أداة **ثابتة بالكامل (Static)** بلا أي خادم خلفي (Backend) أو قاعدة بيانات:
- لا توجد بيانات مستخدمين تُرسَل أو تُخزَّن على أي خادم — كل شيء يبقى محلياً بمتصفح الزائر (`localStorage`) فقط.
- لا توجد نماذج تسجيل دخول، ولا معالجة دفع، ولا أي اتصال بخادم خارجي عدا تحميل خط Google Fonts.
- قفل تعديل جدول التعرفة (رمز PIN) حماية واجهة بسيطة فقط ضد التعديل العرضي — **ليس تشفيراً حقيقياً** (موثّق بوضوح بـREADME.md)، لأنه لا توجد بيانات حساسة فعلية ليحميها أصلاً.

## رؤوس الأمان (Security Headers)

### ✅ ما طُبِّق فعلياً (عبر Meta Tags بـ `index.html`)
| الرأس | الحالة |
|---|---|
| `Content-Security-Policy` | ✅ مُطبَّق (يمنع تحميل أي سكربت أو مورد خارجي غير مصرَّح به) |
| `Referrer-Policy` | ✅ مُطبَّق (`strict-origin-when-cross-origin`) |

### ⚠️ ما لا يمكن تطبيقه على GitHub Pages (قيد حقيقي، وليس إهمالاً)
GitHub Pages استضافة **ثابتة بحتة** لا تسمح بإضافة أي رأس HTTP مخصص إطلاقاً. الرؤوس التالية **يستحيل تفعيلها عبر Meta Tag** (تتجاهلها كل المتصفحات إن حاولت ذلك) وتتطلب خادماً يدعم رؤوساً مخصصة:

- `X-Frame-Options`
- `X-Content-Type-Options`
- `Strict-Transport-Security` (HSTS)
- `Permissions-Policy`

### البديل المُوصى به: Netlify
لو أردتم هذه الحماية الإضافية مستقبلاً، انشروا نفس المشروع (بلا أي تعديل بالكود) على **Netlify** المجاني بدل GitHub Pages، وأضيفوا ملف `_headers` بجذر المشروع بهذا المحتوى الجاهز:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Referrer-Policy: strict-origin-when-cross-origin
```

Netlify يقرأ هذا الملف تلقائياً ويطبّق الرؤوس على كل الصفحات بلا أي إعداد إضافي.

## سجل مراجعات الأمان
- **2026-08-12**: مراجعة أمان إنتاجية شاملة — تحقق من عدم وجود مفاتيح API أو معلومات حساسة، إضافة CSP وReferrer-Policy، إضافة security.txt.
