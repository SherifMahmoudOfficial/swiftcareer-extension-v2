# CV, Cover Letter, and Interview QA Generation - Complete Guide

## Overview

This document provides detailed technical documentation for generating CV, Cover Letter, and Interview QA messages in the chat system. These messages are generated in the **Frontend (Flutter)** using DeepSeek AI directly, unlike Job Analysis which uses a Backend Edge Function.

## Table of Contents

1. [Message Generation Order](#message-generation-order)
2. [Common Architecture](#common-architecture)
3. [CV Generation](#cv-generation)
4. [Cover Letter Generation](#cover-letter-generation)
5. [Interview QA Generation](#interview-qa-generation)
6. [Message Persistence](#message-persistence)
7. [Chrome Extension Implementation Guide](#chrome-extension-implementation-guide)

## Message Generation Order

### Execution Order (Parallel)

After Job Analysis completes, the following messages are generated **in parallel**:

1. **Step 3**: Network Intro (if enabled)
2. **Step 4**: Network (if enabled)
3. **Step 5**: CV (parallel execution)
4. **Step 6**: Cover Letter (parallel execution)
5. **Step 7**: Interview QA (parallel execution)

### Display Order (Sequential)

Messages are displayed to the user in this **sequential order**:

```
1. job_results (from Job Analysis)
2. match_analysis (from Job Analysis)
3. network_intro
4. network
5. cover_letter
6. cv
7. interview_qa
```

**Key Point**: Messages execute in parallel but display sequentially using `_enqueueOrderedMessage()`.

## Common Architecture

### DeepSeek API Configuration

All three message types use the same DeepSeek API:

- **Endpoint**: `https://api.deepseek.com/chat/completions`
- **Model**: `deepseek-chat`
- **API Key**: From environment variable `DEEPSEEK_API_KEY`
- **Headers**:
  ```json
  {
    "Content-Type": "application/json",
    "Authorization": "Bearer <DEEPSEEK_API_KEY>"
  }
  ```

### Common Request Structure

```typescript
{
  "model": "deepseek-chat",
  "messages": [
    {
      "role": "system",
      "content": "<system_prompt>"
    },
    {
      "role": "user",
      "content": "<user_prompt>"
    }
  ],
  "temperature": <0.3-0.55>,
  "response_format": { "type": "json_object" } // for structured responses
}
```

### Prerequisites

All three message types require:
- User must have skills in profile (otherwise shows `missing_skills` message)
- Message type must be enabled in `MessageTypesConfig`
- Message type must be enabled in user preferences

## CV Generation

### Location

- **Service**: `lib/services/cv_tailoring_service.dart`
- **Method**: `CVTailoringService.tailorCVDataWithReport()`
- **Orchestration**: `lib/pages/chat/chat_workspace_page.dart` - `_prepareTailoredCvDraftParallel()`

### Input Data Required

```dart
{
  originalCVData: CVData,        // User's CV data from profile
  jobData: LinkedInJobData,      // Job information
  jobSkills: List<String>,       // Extracted job skills
  userInstructions: String?,     // Optional user custom instructions
  focusLabel: String?,           // Optional focus keywords
  jobDescriptionOverride: String? // Optional job description override
}
```

### CV Data Structure

```dart
class CVData {
  UserProfile user;              // Full name, headline, summary, skills
  List<WorkExperience> workExperiences;
  List<Education> educations;
  List<Project> projects;
  List<Certification> certifications;
  List<Language> languages;
  List<Award> awards;
}
```

### AI Prompt Structure

**System Prompt:**
```
You are a professional CV tailoring expert. Your PRIMARY GOAL is to MAXIMIZE the job match percentage by making AGGRESSIVE, SIGNIFICANT improvements.

CRITICAL RULES:
1. NEVER add information that is not present in the original CV data
2. ONLY rephrase, prioritize, and select from existing information
3. Use synonyms and keywords from the job description intelligently
4. Focus on aspects most relevant to the job requirements
```

**User Prompt Includes:**
- Job information (title, company, location, description, experience level)
- User CV data (summary, skills, work experiences, projects)
- User instructions (if provided)
- Focus label (if provided)
- JSON structure specification for response

### AI Response Format

```json
{
  "summary": "Rephrased professional summary (2-4 sentences)",
  "focus_summary": "Short label (1-3 words) or null",
  "skills": ["Prioritized", "list", "of", "skills"],
  "highlights": [
    {
      "text": "Rephrased achievement 1",
      "source": "experience|project",
      "index": 0
    }
  ],
  "experiences": [
    {
      "index": 0,
      "description": "Enhanced description focusing on relevant aspects"
    }
  ]
}
```

### Processing Steps

1. **Build Prompt**: `_buildTailoringPrompt()` - constructs comprehensive prompt
2. **Call DeepSeek API**: `_callDeepSeekAPI()` - sends request to DeepSeek
3. **Parse Response**: `_parseTailoredPatch()` - extracts tailored data
4. **Apply Patch**: `_applyPatch()` - applies changes to original CV data
5. **Calculate Match**: `_calculateCompositeMatch()` - calculates before/after match percentage
6. **Build Report**: Creates `TailoredCvReport` with all changes

### Match Calculation

Uses composite match calculation:
- **Skills**: 40% weight
- **Summary**: 30% weight
- **Experiences**: 30% weight

### Message Metadata

```dart
{
  'type': 'cv',
  'summary': report.tailoredCvData.user.summary,
  'matchBefore': report.matchBefore,
  'matchAfter': report.matchAfter,
  'highlights': report.patch.highlights,
  'skills': report.tailoredCvData.user.skills,
  'changes': report.changes,
  'isGenerating': false,
  'credits_used': 0
}
```

### Database Storage

CV is saved to `cvs` table:
- `title`: "Company — Job Title"
- `content`: CV text content
- `job_url`: Job URL
- `thread_id`: Chat thread ID
- `tailored_report`: JSON containing full `TailoredCvReport`

## Cover Letter Generation

### Location

- **Function**: `lib/openai/openai_config.dart` - `generateCoverLetterDraft()`
- **Orchestration**: `lib/pages/chat/chat_workspace_page.dart` - `_generateCoverLetterParallel()`

### Input Parameters

```dart
{
  profile: UserProfile,          // User profile data
  jobTitle: String,
  company: String,
  jobDescription: String?,
  jobUrl: String?,
  instructions: String?,         // Optional user instructions
  temperature: double = 0.45,
  timeout: Duration = 60 seconds
}
```

### AI Prompt Structure

**System Prompt:**
```
You are an expert cover letter writer for job applications.

Write a tailored cover letter using ONLY the provided candidate profile and job context. Do not fabricate employers, degrees, or achievements.

Output rules:
- Output plain text only (no markdown, no JSON).
- 180-320 words unless the user instructions specify otherwise.
- Use the SAME language as the user instructions when present; otherwise match the job description language.
- Structure: Greeting, 2-3 short paragraphs, closing, signature with the candidate name.
- Be specific and quantify impact when possible, but do not invent numbers.
```

**User Prompt:**
```
Candidate profile:
Name: {profile.fullName}
Email: {profile.email}
Headline: {profile.headline}
Location: {profile.location}
LinkedIn: {profile.linkedin}
Summary: {profile.summary} (clipped to 1200 chars)
Skills: {profile.skills.join(', ')}

Job:
Title: {jobTitle}
Company: {company}
Job URL: {jobUrl or 'N/A'}
Job description: {jobDescription} (clipped to 2500 chars)

User instructions (optional):
{instructions or 'None'} (clipped to 800 chars)

Write the cover letter now.
```

### AI Response Format

**Plain text** (not JSON):
- 180-320 words
- Greeting
- 2-3 short paragraphs
- Closing
- Signature with candidate name

### Request Configuration

```dart
{
  model: 'deepseek-chat',
  messages: [system, user],
  temperature: 0.45  // Lower for more focused writing
}
```

**Note**: No `response_format` - returns plain text.

### Message Metadata

```dart
{
  'type': 'cover_letter',
  'content': coverLetterContent,  // Full text
  'instructions': instructions,   // User instructions (if provided)
  'credits_used': 0
}
```

### Message Content

```dart
content: "I've prepared a draft cover letter for you:"
```

## Interview QA Generation

### Location

- **Function**: `lib/openai/openai_config.dart` - `generateInterviewQAs()`
- **Orchestration**: `lib/pages/chat/chat_workspace_page.dart` - `_generateInterviewQAParallel()`

### Input Parameters

```dart
{
  profile: UserProfile,
  jobTitle: String,
  company: String,
  jobDescription: String?,
  jobRequirements: List<String>?,  // Job skills
  experienceLevel: String?,
  batchIndex: int = 1              // For generating multiple batches
}
```

### Batch System

Interview QA supports multiple batches with different focuses:

- **Batch 1**: Technical questions (skills, tools, technologies)
- **Batch 2**: Behavioral questions (STAR method)
- **Batch 3**: Problem-solving and scenario-based questions
- **Batch 4**: Motivation and culture fit questions
- **Batch 5+**: Advanced and edge-case questions

### AI Prompt Structure

**System Prompt:**
```
You are an interview coach. Output the result as a JSON object only. The object must include an array "items" of exactly 5 elements and nothing else. Each element has: {"q": string, "a": string}. Keep answers concise (2-4 sentences), practical, and tailored to the role.

IMPORTANT - This is batch #{batchIndex}: {batchFocus}

Generate questions that are DIFFERENT from typical generic questions. Make them specific to the job requirements and responsibilities mentioned.
```

**User Prompt:**
```
Profile: {profile.fullName} | {profile.headline} | Skills: {profile.skills.join(', ')} | Location: {profile.location}

Role: "{jobTitle}" at "{company}"

Experience Level: {experienceLevel} (if provided)

Job Description: {jobDescription} (truncated to 2000 chars if longer)

Required Skills/Technologies: {jobRequirements.join(', ')} (if provided)

Generate 5 expected interview questions and concise answers. Return JSON with {"items":[{"q":"...","a":"..."}, ...]}.
```

### AI Response Format

```json
{
  "items": [
    {
      "q": "Question 1",
      "a": "Answer 1 (2-4 sentences)"
    },
    {
      "q": "Question 2",
      "a": "Answer 2"
    },
    // ... 5 total
  ]
}
```

### Request Configuration

```dart
{
  model: 'deepseek-chat',
  messages: [system, user],
  temperature: 0.55,  // Slightly higher for diversity
  response_format: { type: 'json_object' }
}
```

### Message Metadata

```dart
{
  'type': 'interview_qa',
  'interviewQA': [
    {'q': 'Question 1', 'a': 'Answer 1'},
    {'q': 'Question 2', 'a': 'Answer 2'},
    // ... 5 questions
  ],
  'batchIndex': 1,
  'credits_used': 0
}
```

### Message Content

```dart
content: "Here are ${interviewQA.length} interview questions to help you prepare:"
```

## Message Persistence

### Database Tables

All messages are saved to `chat_messages` table:

```sql
INSERT INTO chat_messages (
  thread_id,
  role,           -- 'assistant'
  content,        -- Message text
  metadata        -- JSONB with type-specific data
)
```

### Message Ordering System

Messages use `_enqueueOrderedMessage()` to ensure sequential display:

```dart
static const List<String> _orderedMessageKeys = [
  'job_results',
  'match_analysis',
  'network_intro',
  'network',
  'cover_letter',
  'cv',
  'interview_qa',
];
```

### Message Creation Flow

1. Generate content (CV/Cover Letter/Interview QA)
2. Build metadata with type-specific data
3. Call `_enqueueOrderedMessage(messageType, messageFunction)`
4. `_enqueueOrderedMessage` ensures messages display in correct order
5. Call `_sendSystemMessage()` to persist to database
6. Message appears in chat in sequential order

## Chrome Extension Implementation Guide

### Step 1: Get Required Data

Before generating any message, you need:

```javascript
// From job analysis response
const jobData = {
  title: "...",
  company: "...",
  description: "...",
  location: "...",
  experienceLevel: "...",
  skills: ["...", "..."]
};

// From user profile (via API)
const userProfile = {
  fullName: "...",
  email: "...",
  headline: "...",
  summary: "...",
  skills: ["...", "..."],
  workExperiences: [...],
  projects: [...],
  educations: [...]
};

// Optional
const userInstructions = "...";  // User custom instructions
const focusLabel = "...";         // Focus keywords
```

### Step 2: Generate Cover Letter

**API Call:**
```javascript
async function generateCoverLetter(userProfile, jobData, instructions) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are an expert cover letter writer for job applications.

Write a tailored cover letter using ONLY the provided candidate profile and job context. Do not fabricate employers, degrees, or achievements.

Output rules:
- Output plain text only (no markdown, no JSON).
- 180-320 words unless the user instructions specify otherwise.
- Use the SAME language as the user instructions when present; otherwise match the job description language.
- Structure: Greeting, 2-3 short paragraphs, closing, signature with the candidate name.
- Be specific and quantify impact when possible, but do not invent numbers.`
        },
        {
          role: 'user',
          content: `Candidate profile:
Name: ${userProfile.fullName}
Email: ${userProfile.email}
Headline: ${userProfile.headline}
Location: ${userProfile.location}
LinkedIn: ${userProfile.linkedin || 'N/A'}
Summary: ${userProfile.summary.substring(0, 1200)}
Skills: ${userProfile.skills.join(', ')}

Job:
Title: ${jobData.title}
Company: ${jobData.company}
Job URL: ${jobData.jobUrl || 'N/A'}
Job description:
${jobData.description.substring(0, 2500)}

User instructions (optional):
${instructions || 'None'}

Write the cover letter now.`
        }
      ],
      temperature: 0.45
    })
  });

  const data = await response.json();
  return data.choices[0].message.content.trim();
}
```

**Create Message:**
```javascript
const coverLetterContent = await generateCoverLetter(userProfile, jobData, instructions);

// Save to chat_messages via Supabase
await supabase.from('chat_messages').insert({
  thread_id: threadId,
  role: 'assistant',
  content: "I've prepared a draft cover letter for you:",
  metadata: {
    type: 'cover_letter',
    content: coverLetterContent,
    instructions: instructions || null,
    credits_used: 0
  }
});
```

### Step 3: Generate Interview QA

**API Call:**
```javascript
async function generateInterviewQA(userProfile, jobData, batchIndex = 1) {
  const batchFocuses = {
    1: 'Focus on role-specific TECHNICAL questions about skills, tools, and technologies mentioned in the job.',
    2: 'Focus on BEHAVIORAL questions using STAR method (Tell me about a time when...).',
    3: 'Focus on PROBLEM-SOLVING and SCENARIO-based questions (What would you do if..., How would you handle...).',
    4: 'Focus on MOTIVATION and CULTURE FIT questions (Why this company, career goals, work style).'
  };

  const batchFocus = batchFocuses[batchIndex] || 
    `Focus on ADVANCED and EDGE-CASE questions that test deeper expertise and critical thinking. Batch #${batchIndex}.`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are an interview coach. Output the result as a JSON object only. The object must include an array "items" of exactly 5 elements and nothing else. Each element has: {"q": string, "a": string}. Keep answers concise (2-4 sentences), practical, and tailored to the role.

IMPORTANT - This is batch #${batchIndex}: ${batchFocus}

Generate questions that are DIFFERENT from typical generic questions. Make them specific to the job requirements and responsibilities mentioned.`
        },
        {
          role: 'user',
          content: `Profile: ${userProfile.fullName} | ${userProfile.headline} | Skills: ${userProfile.skills.join(', ')} | Location: ${userProfile.location}

Role: "${jobData.title}" at "${jobData.company}"

${jobData.experienceLevel ? `Experience Level: ${jobData.experienceLevel}` : ''}

${jobData.description ? `Job Description: ${jobData.description.substring(0, 2000)}` : ''}

${jobData.skills && jobData.skills.length > 0 ? `Required Skills/Technologies: ${jobData.skills.join(', ')}` : ''}

Generate 5 expected interview questions and concise answers. Return JSON with {"items":[{"q":"...","a":"..."}, ...]}.`
        }
      ],
      temperature: 0.55,
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  const content = JSON.parse(data.choices[0].message.content);
  return content.items; // Array of {q, a} objects
}
```

**Create Message:**
```javascript
const interviewQA = await generateInterviewQA(userProfile, jobData, 1);

// Save to chat_messages via Supabase
await supabase.from('chat_messages').insert({
  thread_id: threadId,
  role: 'assistant',
  content: `Here are ${interviewQA.length} interview questions to help you prepare:`,
  metadata: {
    type: 'interview_qa',
    interviewQA: interviewQA,
    batchIndex: 1,
    credits_used: 0
  }
});
```

### Step 4: Generate CV

**Note**: CV generation is more complex as it requires:
1. Building comprehensive prompt with all CV data
2. Parsing structured JSON response
3. Calculating match percentages
4. Building change list

**Simplified Approach for Extension:**

```javascript
async function generateTailoredCV(cvData, jobData, jobSkills, userInstructions, focusLabel) {
  // Build comprehensive prompt (see CVTailoringService._buildTailoringPrompt for full structure)
  const prompt = buildCVTailoringPrompt(cvData, jobData, userInstructions, focusLabel);

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'You are a professional CV tailoring expert. Your goal is to MAXIMIZE job match by making AGGRESSIVE improvements while strictly adhering to the original data. Output only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.55,
      response_format: { type: 'json_object' },
      timeout: 90000
    })
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

**Full Implementation**: See `lib/services/cv_tailoring_service.dart` for complete implementation including match calculation.

### Step 5: Message Ordering

When creating messages, ensure they follow the display order:

```javascript
const messageOrder = [
  'job_results',      // From job analysis
  'match_analysis',    // From job analysis
  'network_intro',    // Optional
  'network',          // Optional
  'cover_letter',     // Generate this
  'cv',               // Generate this
  'interview_qa'      // Generate this
];

// Create messages in order
for (const messageType of messageOrder) {
  if (shouldGenerate[messageType]) {
    await generateAndSaveMessage(messageType);
    // Wait a bit to ensure sequential display
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
```

### Required Environment Variables

- `DEEPSEEK_API_KEY`: Required for all AI generation
- `SUPABASE_URL`: For saving messages
- `SUPABASE_ANON_KEY`: For Supabase client

### Error Handling

All three message types should handle:
- Missing user skills → Show `missing_skills` message
- API failures → Use fallback stub content
- Timeout errors → Retry with exponential backoff
- Invalid responses → Parse gracefully with defaults

### Cost Considerations

- **CV**: 1 AI call (complex prompt, ~90s timeout)
- **Cover Letter**: 1 AI call (medium prompt, ~60s timeout)
- **Interview QA**: 1 AI call per batch (simple prompt, ~45s timeout)

**Total**: 3 AI calls per full analysis (if all enabled)

## Summary

### Key Differences from Job Analysis

| Feature | Job Analysis | CV/Cover Letter/Interview QA |
|---------|--------------|------------------------------|
| **Location** | Backend (Edge Function) | Frontend (Direct AI calls) |
| **API** | Supabase Edge Function | DeepSeek API directly |
| **Can call from Extension?** | Yes (via Edge Function) | Yes (via DeepSeek API) |
| **Database writes** | None (stateless) | Saves to `chat_messages` |

### Implementation Checklist

- [ ] Get user profile data (CV data, skills, experiences)
- [ ] Get job data (from job analysis or manual input)
- [ ] Check user has skills (show `missing_skills` if not)
- [ ] Check message type enabled in preferences
- [ ] Generate content via DeepSeek API
- [ ] Parse response appropriately
- [ ] Build message metadata
- [ ] Save to `chat_messages` table
- [ ] Ensure correct display order

### Files Reference

**CV Generation:**
- Service: `lib/services/cv_tailoring_service.dart`
- Orchestration: `lib/pages/chat/chat_workspace_page.dart` (line ~4930)

**Cover Letter Generation:**
- Function: `lib/openai/openai_config.dart` (line ~698)
- Orchestration: `lib/pages/chat/chat_workspace_page.dart` (line ~4627)

**Interview QA Generation:**
- Function: `lib/openai/openai_config.dart` (line ~350)
- Orchestration: `lib/pages/chat/chat_workspace_page.dart` (line ~4802)

**Message Ordering:**
- `lib/pages/chat/chat_workspace_page.dart` (line ~214): `_orderedMessageKeys`
