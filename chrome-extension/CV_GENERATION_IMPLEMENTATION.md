# CV, Cover Letter, and Interview QA Generation - Implementation Summary

## Overview

تم تنفيذ نظام توليد CV وCover Letter وInterview QA في Chrome Extension بعد اكتمال Job Analysis، مع حفظ كل البيانات في قاعدة البيانات بالترتيب الصحيح.

## الملفات الجديدة

### 1. `utils/generators.js`
وظائف توليد المحتوى باستخدام DeepSeek API:
- `generateCoverLetter()` - توليد Cover Letter
- `generateInterviewQA()` - توليد Interview QA (batches)
- `generateTailoredCV()` - توليد CV مخصص

### 2. `utils/cv_data.js`
وظائف جلب CV data من قاعدة البيانات:
- `getCompleteCVData()` - جلب كل بيانات CV (user, work_experiences, educations, projects, certifications, languages, awards)

## الملفات المعدلة

### 1. `utils/api.js`
إضافة وظائف جديدة:
- `saveCVToDatabase()` - حفظ CV في `cvs` table
- `createCVCoverLetterInterviewQAMessages()` - إنشاء رسائل CV/Cover Letter/Interview QA بالترتيب الصحيح

### 2. `background/background.js`
إضافة منطق التوليد بعد Job Analysis:
- `getUserMessagePreferences()` - جلب تفضيلات المستخدم
- `generateContentAfterJobAnalysis()` - توليد كل المحتوى بعد Job Analysis
- استدعاء التوليد بعد اكتمال Job Analysis

### 3. `options/options.html`
إضافة قسم DeepSeek API Configuration:
- حقل لإدخال `DEEPSEEK_API_KEY`
- زر لحفظ المفتاح

### 4. `options/options.js`
إضافة وظائف DeepSeek:
- `loadDeepSeekConfiguration()` - تحميل المفتاح المحفوظ
- `saveDeepSeekConfiguration()` - حفظ المفتاح
- `showDeepSeekMessage()` - عرض رسائل الحالة

### 5. `utils/supabase.js`
تحسين دعم `single()` في query builder

## التدفق الكامل

1. **Job Analysis** → يتم تحليل الوظيفة
2. **Check Preferences** → التحقق من `message_preferences` للمستخدم
3. **Check Skills** → التحقق من وجود skills للمستخدم
4. **Generate Content** (إذا كان مفعل):
   - Cover Letter (إذا `cover_letter: true`)
   - CV (إذا `cv: true` و user has skills)
   - Interview QA (إذا `interview_qa: true` و user has skills)
5. **Save to Database**:
   - CV → `cvs` table
   - Messages → `chat_messages` table بالترتيب الصحيح
6. **Return Results** → إرجاع النتائج

## ترتيب الرسائل

الرسائل يتم إنشاؤها بالترتيب التالي:
1. `job_results` (من Job Analysis)
2. `match_analysis` (من Job Analysis)
3. `cover_letter` (جديد)
4. `cv` (جديد)
5. `interview_qa` (جديد)

## Error Handling

- إذا DeepSeek API فشل → استخدام fallback stub content
- إذا المستخدم ليس لديه skills → تخطي CV/Interview QA
- إذا timeout → retry مع exponential backoff
- Logging شامل لكل خطوة

## Configuration

### DeepSeek API Key
يجب إدخال `DEEPSEEK_API_KEY` في Options Page:
1. افتح Options Page
2. اذهب إلى "DeepSeek API Configuration"
3. أدخل المفتاح
4. احفظ

### User Preferences
يتم التحقق من `message_preferences` في `users` table:
```json
{
  "cv": true,
  "cover_letter": true,
  "interview_qa": true
}
```

## Database Tables Used

### `cvs` table
- `user_id` - User ID
- `title` - "Company — Job Title"
- `content` - CV text content
- `job_url` - Job URL
- `thread_id` - Chat thread ID
- `tailored_report` - JSON containing full CV report

### `chat_messages` table
- `thread_id` - Chat thread ID
- `role` - 'assistant'
- `content` - Message text
- `metadata` - JSONB with type-specific data:
  - `type`: 'cover_letter' | 'cv' | 'interview_qa'
  - Type-specific fields

## Testing Checklist

- [ ] DeepSeek API Key configured
- [ ] User has skills in profile
- [ ] User preferences enabled
- [ ] Job Analysis completes successfully
- [ ] Cover Letter generated and saved
- [ ] CV generated and saved
- [ ] Interview QA generated and saved
- [ ] Messages appear in correct order
- [ ] Error handling works correctly

## Notes

- التوليد يتم بشكل متوازي (parallel) لكن الرسائل تُعرض بشكل متسلسل (sequential)
- إذا فشل توليد نوع واحد، يستمر التوليد للأنواع الأخرى
- Fallback content يتم استخدامه في حالة فشل API
- Logging شامل لتسهيل debugging
