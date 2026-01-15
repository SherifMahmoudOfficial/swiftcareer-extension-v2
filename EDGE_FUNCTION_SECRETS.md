# Edge Function Secrets Configuration

## Required Secrets for `job_analysis` Edge Function

يجب إضافة هذه الـ Secrets في Supabase Dashboard:

### 1. DEEPSEEK_API_KEY
- **Name**: `DEEPSEEK_API_KEY`
- **Value**: (يجب الحصول عليه من DeepSeek)
- **Purpose**: يستخدم لتحليل الوظائف واستخراج المهارات

### 2. APIFY_API_KEY
- **Name**: `APIFY_API_KEY`
- **Value**: `<YOUR_APIFY_API_KEY>`
- **Purpose**: يستخدم لسحب بيانات الوظائف من LinkedIn

## خطوات الإعداد

1. افتح [Supabase Dashboard](https://app.supabase.com)
2. اختر مشروعك
3. اذهب إلى **Edge Functions** من القائمة الجانبية
4. اضغط على `job_analysis` function
5. اذهب إلى **Settings** → **Secrets**
6. أضف كل secret:
   - اضغط **Add Secret**
   - أدخل الاسم (Name)
   - أدخل القيمة (Value)
   - اضغط **Save**

## التحقق من الإعداد

بعد إضافة الـ Secrets، تأكد من:
- ✅ `DEEPSEEK_API_KEY` موجود
- ✅ `APIFY_API_KEY` موجود
- ✅ Function منشور (Deployed)

## ملاحظات

- الـ Secrets محمية ولا يمكن الوصول إليها من الكود الخارجي
- Chrome Extension لا يحتاج هذه المفاتيح - يستدعي Edge Function فقط
- Edge Function يستخدم هذه المفاتيح بشكل آمن في السيرفر
