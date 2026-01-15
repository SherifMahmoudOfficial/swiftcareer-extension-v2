# Troubleshooting Guide

## Service Worker Registration Failed (Status Code: 15)

إذا واجهت خطأ "Service worker registration failed. Status code: 15"، اتبع الخطوات التالية:

### 1. إعادة تحميل Extension
1. افتح `chrome://extensions/`
2. ابحث عن "SwiftCareer - LinkedIn Job Analyzer"
3. اضغط على زر "Reload" (🔄) لإعادة تحميل Extension

### 2. التحقق من Console
1. افتح Developer Tools (F12)
2. اذهب إلى Console tab
3. ابحث عن أي أخطاء في تحميل الملفات

### 3. التحقق من الملفات
تأكد من أن جميع الملفات التالية موجودة:
- `background/background.js`
- `utils/api.js`
- `utils/supabase.js`
- `utils/generators.js`
- `utils/cv_data.js`
- `utils/storage.js`

### 4. التحقق من manifest.json
تأكد من أن `manifest.json` يحتوي على:
```json
{
  "background": {
    "service_worker": "background/background.js",
    "type": "module"
  }
}
```

### 5. إعادة تثبيت Extension
إذا استمرت المشكلة:
1. احذف Extension من `chrome://extensions/`
2. أعد تحميله من مجلد `chrome-extension`

### 6. التحقق من Permissions
تأكد من أن Extension لديه الأذونات التالية:
- `storage`
- `activeTab`
- `scripting`
- `https://*.linkedin.com/*`
- `https://*.supabase.co/*`
- `https://api.deepseek.com/*`

### 7. التحقق من Console Logs
بعد إعادة التحميل، افتح Console وتحقق من:
```
[Background] 🚀 Service Worker initialized successfully
[Background] 📦 All modules imported successfully
```

إذا لم تظهر هذه الرسائل، فهناك مشكلة في تحميل الملفات.

## Common Issues

### Issue: "Failed to import module"
**Solution**: تأكد من أن جميع المسارات صحيحة وأن الملفات موجودة

### Issue: "DeepSeek API key not configured"
**Solution**: 
1. افتح Options Page
2. اذهب إلى "DeepSeek API Configuration"
3. المفتاح الافتراضي موجود، لكن يمكنك التحقق منه

### Issue: "User has no skills"
**Solution**: تأكد من أن المستخدم لديه skills في profile قبل توليد CV/Interview QA

## Debugging Tips

1. **افتح Background Page Console**:
   - اذهب إلى `chrome://extensions/`
   - اضغط على "service worker" link تحت Extension
   - ستفتح Console للـ Service Worker

2. **تحقق من Network Requests**:
   - افتح Network tab في Developer Tools
   - تحقق من أن جميع الطلبات تنجح

3. **تحقق من Storage**:
   - افتح Application tab في Developer Tools
   - اذهب إلى Storage → Local Storage
   - تحقق من أن البيانات محفوظة بشكل صحيح
