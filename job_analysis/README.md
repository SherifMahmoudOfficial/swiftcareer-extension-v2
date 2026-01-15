# Job Analysis Edge Function

تقوم هذه الـ Edge Function بتحليل الوظائف بشكل كامل، سواء من LinkedIn URL أو من وصف الوظيفة كنص.

## الميزات

1. **تحليل LinkedIn Jobs**: يستخدم Apify لجلب بيانات الوظيفة من LinkedIn
2. **تحليل النصوص**: يستخدم DeepSeek AI لتحليل أوصاف الوظائف النصية
3. **استخراج المهارات**: يستخرج المهارات المطلوبة من وصف الوظيفة تلقائياً
4. **حساب التطابق**: يحسب نسبة التطابق بين مهارات المستخدم ومتطلبات الوظيفة
5. **اقتراحات التحسين**: يقترح مهارات إضافية لتحسين فرص القبول

## المتغيرات البيئية المطلوبة

يجب تعيين هذه المتغيرات في Supabase Dashboard > Edge Functions > Secrets:

- `DEEPSEEK_API_KEY`: مفتاح API لـ DeepSeek (مطلوب)
- `APIFY_API_KEY`: مفتاح API لـ Apify (مطلوب لتحليل LinkedIn URLs)
  - القيمة: `<YOUR_APIFY_API_KEY>`

## الاستخدام

### من Flutter

```dart
import 'package:swiftcareer/services/job_analysis_service.dart';

// تحليل وظيفة من LinkedIn URL
final result = await JobAnalysisService.analyzeJob(
  jobInput: 'https://www.linkedin.com/jobs/view/1234567890',
  userId: currentUser.id,
  userSkills: ['Flutter', 'Dart', 'Firebase'],
  userProfile: {
    'fullName': 'John Doe',
    'email': 'john@example.com',
    'headline': 'Senior Flutter Developer',
  },
);

// تحليل وظيفة من نص
final result = await JobAnalysisService.analyzeJob(
  jobInput: 'Job Title: Senior Flutter Developer\\n\\nDescription: ...',
  userId: currentUser.id,
  userSkills: ['Flutter', 'Dart', 'Firebase'],
);

// استخدام النتائج
print('Match: ${result.matchAnalysis.matchPercentage}%');
print('Job Title: ${result.jobData.jobInfo.title}');
print('Matching Skills: ${result.matchAnalysis.matchingSkills}');
```

### من أي مكان آخر (API Call)

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/job_analysis' \\
  -H 'Authorization: Bearer YOUR_ANON_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "jobInput": "https://www.linkedin.com/jobs/view/1234567890",
    "userId": "user-id",
    "userSkills": ["Flutter", "Dart", "Firebase"]
  }'
```

## البنية الاستجابة

```typescript
{
  "success": true,
  "data": {
    "jobData": {
      "jobInfo": {
        "title": "Senior Flutter Developer",
        "company": "Google",
        "description": "...",
        "location": "Remote",
        "experienceLevel": "Mid-Senior level",
        "employmentType": "Full-time",
        "jobFunctions": ["Engineering", "Information Technology"],
        "industries": ["Technology"],
        "skills": ["Flutter", "Dart", "Mobile Development"]
      },
      "companyInfo": {
        "name": "Google",
        "description": "...",
        "industry": "Technology",
        "companySize": "10,000+ employees"
      }
    },
    "matchAnalysis": {
      "matchPercentage": 75,
      "matchingSkills": ["Flutter", "Dart", "Mobile Development"],
      "reasoning": "Strong match based on...",
      "suggestedSkills": ["React Native", "CI/CD"],
      "improvedSkills": [
        {
          "skill": "CI/CD",
          "suggestion": "Learn GitHub Actions and Jenkins for automated deployments"
        }
      ],
      "projectedMatchPercentage": 85
    },
    "jobSkills": ["Flutter", "Dart", "Mobile Development", "Firebase"],
    "isLinkedInUrl": true
  }
}
```

## الفوائد

1. **مركزية**: كل لوجيك التحليل في مكان واحد
2. **قابلية إعادة الاستخدام**: يمكن استدعاؤه من أي مكان (Flutter, Web, Mobile, APIs)
3. **الأمان**: API Keys محفوظة في الـ Backend فقط
4. **الأداء**: معالجة متوازية وتحسينات في السيرفر
5. **الصيانة**: سهولة التحديث والتطوير

## نشر الـ Function

من Supabase Panel في Dreamflow:

1. افتح لوحة Supabase من الشريط الجانبي الأيسر
2. انتقل إلى قسم Edge Functions
3. ابحث عن `job_analysis`
4. اضغط Deploy
5. تأكد من إضافة الـ Secrets المطلوبة (DEEPSEEK_API_KEY و APIFY_API_KEY)

## الدعم

للمزيد من المعلومات، راجع:
- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [DeepSeek API Documentation](https://api-docs.deepseek.com/)
- [Apify LinkedIn Scraper](https://apify.com/apify/linkedin-scraper)
