# Job Description Analysis - Complete Backend Flow Documentation

## Overview

This document provides a detailed technical explanation of what happens when a job description is sent in the chat without analysis, focusing on the backend processing pipeline, edge function implementation, and how to perform analysis from external sources.

## Table of Contents

1. [High-Level Flow](#high-level-flow)
2. [Frontend Request Preparation](#frontend-request-preparation)
3. [Edge Function: Request Reception](#edge-function-request-reception)
4. [Edge Function: Input Processing](#edge-function-input-processing)
5. [Edge Function: AI Processing Steps](#edge-function-ai-processing-steps)
6. [Edge Function: Response Format](#edge-function-response-format)
7. [Database Operations](#database-operations)
8. [External Integration Guide](#external-integration-guide)

## High-Level Flow

When a user sends a job description in chat:

```
User Input (Job Description Text)
    ↓
Frontend: Parse & Validate Input
    ↓
Frontend: Fetch User Skills from Profile
    ↓
Frontend: Call JobAnalysisService.analyzeJob()
    ↓
HTTP POST → Supabase Edge Function: /functions/v1/job_analysis
    ↓
Edge Function: Detect Input Type (URL vs Text)
    ↓
[If Text] → AI Parse Job Description
    ↓
AI Extract Skills
    ↓
AI Calculate Skill Match
    ↓
Return JSON Response
    ↓
Frontend: Parse Response & Create Chat Messages
    ↓
Frontend: Persist Messages to Database
```

## Frontend Request Preparation

### Service Location

- File: `lib/services/job_analysis_service.dart`
- Method: `JobAnalysisService.analyzeJob()`

### Request Details

**Endpoint:**

```
POST ${SUPABASE_URL}/functions/v1/job_analysis
```

**Headers:**

```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <access_token>",
  "apikey": "<anon_key>"
}
```

**Request Body:**

```json
{
  "jobInput": "Job description text or LinkedIn URL",
  "userId": "user-uuid",
  "userSkills": ["Skill1", "Skill2", "Skill3"],
  "userProfile": {
    "fullName": "John Doe",
    "email": "john@example.com",
    "headline": "Senior Developer",
    "summary": "Professional summary",
    "location": "San Francisco, CA",
    "linkedin": "https://linkedin.com/in/johndoe",
    "phone": "+1234567890",
    "website": "https://johndoe.com"
  }
}
```

**Required Fields:**

- `jobInput`: String (job description text or LinkedIn URL)
- `userId`: String (UUID of authenticated user)

**Optional Fields:**

- `userSkills`: Array of strings (defaults to empty array)
- `userProfile`: Object (optional user profile data)

## Edge Function: Request Reception

### Location

- File: `lib/supabase/functions/job_analysis/index.ts`
- Entry Point: `Deno.serve(async (req) => {...})`

### Request Processing Steps

1. **CORS Preflight Handling**

   - If `req.method === 'OPTIONS'`, return CORS headers immediately
   - CORS headers allow all origins (`*`)

2. **Request Body Parsing**
   ```typescript
   const requestData: JobAnalysisRequest = await req.json();
   const { jobInput, userId, userSkills = [], userProfile } = requestData;
   ```

3. **Validation**

   - Checks if `jobInput` and `userId` are present
   - Returns 400 error if missing:
   ```json
   {
     "success": false,
     "error": "Missing required fields: jobInput, userId"
   }
   ```


4. **Supabase Client Initialization**
   ```typescript
   const authHeader = req.headers.get('Authorization');
   const supabase = createClient(
     Deno.env.get('SUPABASE_URL') ?? '',
     Deno.env.get('SUPABASE_ANON_KEY') ?? '',
     {
       global: {
         headers: authHeader ? { Authorization: authHeader } : {},
       },
     }
   );
   ```

Note: The edge function currently doesn't use the Supabase client for database operations - it's initialized but not used in the current implementation.

## Edge Function: Input Processing

### Input Type Detection

**Function:** `isLinkedInUrl(input: string): boolean`

**Logic:**

```typescript
function isLinkedInUrl(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return trimmed.includes('linkedin.com/jobs/');
}
```

**Decision Tree:**

```
Input → isLinkedInUrl()?
  ├─ YES → LinkedIn URL Path (Apify Scraping)
  └─ NO  → Text Description Path (AI Parsing)
```

### Text Description Path (Primary Focus)

When `isLinkedInUrl()` returns `false`, the edge function processes the input as plain text:

1. **Call `parseJobDescription(jobDescription: string)`**

   - Uses DeepSeek AI to extract structured data
   - Returns parsed JSON with job fields

2. **Build `jobData` Object**
   ```typescript
   jobData = {
     jobInfo: {
       title: parsedJob.title || '',
       company: parsedJob.company || '',
       description: parsedJob.description || jobInput,
       location: parsedJob.location || '',
       experienceLevel: parsedJob.experienceLevel || '',
       employmentType: parsedJob.employmentType || '',
       jobFunctions: parsedJob.jobFunctions || [],
       industries: parsedJob.industries || [],
       skills: parsedJob.skills || [],
     },
     companyInfo: {
       name: parsedJob.company || '',
       description: '',
       industry: parsedJob.industries?.[0] || '',
       companySize: '',
       websiteUrl: '',
       linkedInUrl: '',
     },
   };
   ```

3. **Extract Job Skills**
   ```typescript
   jobSkills = parsedJob.skills || await extractSkillsFromJobDescription(jobInput);
   ```

   - If skills found in parsed result, use them
   - Otherwise, call AI to extract skills from full description

## Edge Function: AI Processing Steps

### Step 1: Parse Job Description

**Function:** `parseJobDescription(jobDescription: string): Promise<any>`

**AI Provider:** DeepSeek

- Endpoint: `https://api.deepseek.com/chat/completions`
- Model: `deepseek-chat`
- API Key: From environment variable `DEEPSEEK_API_KEY`

**System Prompt:**

```
You are a job description parser. Extract structured information from job postings. Return ONLY valid JSON.
```

**User Prompt:**

```
Parse this job description and extract:

{jobDescription}

Return JSON with this structure:
{
  "title": "job title",
  "company": "company name",
  "location": "location",
  "experienceLevel": "Entry level/Mid-Senior level/etc",
  "employmentType": "Full-time/Part-time/Contract/etc",
  "description": "full job description",
  "jobFunctions": ["function1", "function2"],
  "industries": ["industry1", "industry2"],
  "skills": ["skill1", "skill2"]
}
```

**Request Configuration:**

```typescript
{
  model: DEEPSEEK_MODEL,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  temperature: 0.3,
  response_format: { type: 'json_object' },
}
```

**Response:** Parsed JSON object with structured job fields

### Step 2: Extract Skills (if needed)

**Function:** `extractSkillsFromJobDescription(description: string): Promise<string[]>`

**When Called:**

- If `parsedJob.skills` is empty or missing
- Fallback after parsing

**System Prompt:**

```
You are a skill extraction expert. Extract all technical skills, soft skills, tools, and technologies mentioned in the job description. Return ONLY valid JSON.
```

**User Prompt:**

```
Extract all skills from this job description:

{description}

Return JSON: { "skills": ["skill1", "skill2", ...] }
```

**Request Configuration:**

```typescript
{
  model: DEEPSEEK_MODEL,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  temperature: 0.3,
  response_format: { type: 'json_object' },
}
```

**Response:** Array of skill strings

### Step 3: Calculate Skill Match

**Function:** `calculateSkillMatch(userSkills, jobSkills, jobDescription)`

**Input Parameters:**

- `userSkills`: Array of strings (from user profile)
- `jobSkills`: Array of strings (extracted from job)
- `jobDescription`: Full job description text

**System Prompt:**

```
You are a professional skill matching expert. Analyze how well a candidate's skills match job requirements. Consider:
1. Direct skill matches (exact or similar terms)
2. Transferable skills (related skills that could apply)
3. Skill gaps (missing required skills)
4. Skill improvements (how to bridge gaps)

Return ONLY valid JSON with this structure:
{
  "matchPercentage": number (0-100),
  "matchingSkills": ["skill1", "skill2"],
  "reasoning": "detailed explanation of the match",
  "suggestedSkills": ["missing skill 1", "missing skill 2"],
  "improvedSkills": [
    {"skill": "skill name", "suggestion": "how to improve/acquire it"}
  ],
  "projectedMatchPercentage": number (expected match after improvements, 0-100)
}
```

**User Prompt:**

```
Analyze skill match:

User Skills: {userSkills.join(', ')}

Job Required Skills: {jobSkills.join(', ')}

Job Description:
{jobDescription}

Calculate:
1. Match percentage based on direct and transferable skills
2. List all matching skills (including synonyms/related skills)
3. Provide reasoning for the match score
4. Suggest missing skills to improve match
5. For top 3-5 missing skills, provide specific improvement suggestions
6. Estimate projected match if user acquires suggested skills

Return the analysis as JSON.
```

**Request Configuration:**

```typescript
{
  model: DEEPSEEK_MODEL,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  temperature: 0.4,
  response_format: { type: 'json_object' },
}
```

**Response Processing:**

```typescript
return {
  matchPercentage: Math.max(0, Math.min(100, parsed.matchPercentage || 0)),
  matchingSkills: parsed.matchingSkills || [],
  reasoning: parsed.reasoning || '',
  suggestedSkills: parsed.suggestedSkills || [],
  improvedSkills: parsed.improvedSkills || [],
  projectedMatchPercentage: Math.max(0, Math.min(100, parsed.projectedMatchPercentage || 0)),
};
```

## Edge Function: Response Format

### Success Response

**Status Code:** 200

**Response Structure:**

```json
{
  "success": true,
  "data": {
    "jobData": {
      "jobInfo": {
        "title": "Software Engineer",
        "company": "Tech Corp",
        "description": "Full job description text...",
        "location": "San Francisco, CA",
        "experienceLevel": "Mid-Senior level",
        "employmentType": "Full-time",
        "jobFunctions": ["Engineering"],
        "industries": ["Technology"],
        "skills": ["Python", "React", "TypeScript"]
      },
      "companyInfo": {
        "name": "Tech Corp",
        "description": "",
        "industry": "Technology",
        "companySize": "",
        "websiteUrl": "",
        "linkedInUrl": ""
      }
    },
    "matchAnalysis": {
      "matchPercentage": 72,
      "matchingSkills": ["Python", "React", "TypeScript"],
      "reasoning": "You have strong frontend skills with React and TypeScript, and backend experience with Python. However, you're missing Docker and Kubernetes which are mentioned as required.",
      "suggestedSkills": ["Docker", "Kubernetes"],
      "improvedSkills": [
        {
          "skill": "Python",
          "suggestion": "Python (Advanced) - Consider learning advanced Python patterns and frameworks"
        }
      ],
      "projectedMatchPercentage": 83
    },
    "jobSkills": ["Python", "React", "TypeScript", "Docker", "Kubernetes"],
    "isLinkedInUrl": false
  }
}
```

### Error Response

**Status Code:** 500

**Response Structure:**

```json
{
  "success": false,
  "error": "Error message description"
}
```

**Common Errors:**

- `"Missing required fields: jobInput, userId"` (400)
- `"DeepSeek API key not configured"` (500)
- `"DeepSeek API error: {statusText}"` (500)
- `"Internal server error"` (500)

## Database Operations

### Important Note

**The edge function itself does NOT write to the database.** It's a stateless function that:

- Receives request
- Processes with AI
- Returns response
- No database writes occur in the edge function

### Database Operations (Frontend Side)

After receiving the edge function response, the frontend performs database operations:

#### 1. Chat Thread Creation/Update

**Table:** `chat_threads`

- Created if new thread needed
- Updated with `job_context` if job URL/description provided
- Fields updated:
  - `job_context`: Job URL or description text
  - `title`: Auto-generated (e.g., "Job #12345" or "New Job Application")
  - `user_instructions`: User-provided custom instructions
  - `focus_label`: Extracted focus keywords

#### 2. Chat Message Creation

**Table:** `chat_messages`

**User Message:**

```json
{
  "thread_id": "uuid",
  "role": "user",
  "content": "Job description text...",
  "metadata": null
}
```

**Assistant Messages Created:**

**a) `analyzing` Message:**

```json
{
  "thread_id": "uuid",
  "role": "assistant",
  "content": "Analyzing job...",
  "metadata": {
    "type": "analyzing"
  }
}
```

**b) `job_results` Message:**

```json
{
  "thread_id": "uuid",
  "role": "assistant",
  "content": "Job analyzed successfully",
  "metadata": {
    "type": "job_results",
    "jobResult": {
      "title": "Software Engineer",
      "company": "Tech Corp",
      "location": "San Francisco, CA",
      "level": "Mid-Senior level",
      "remote": false,
      "type": "Full-time"
    },
    "jobAnalysis": {
      "jobDescription": "Full description...",
      "jobSkills": ["Python", "React"],
      "userSkills": ["Python", "Dart"],
      "skills": ["Python", "React", "TypeScript"]
    },
    "jobLink": "",
    "credits_used": 0
  }
}
```

**c) `match_analysis` Message:**

```json
{
  "thread_id": "uuid",
  "role": "assistant",
  "content": "Match analysis complete",
  "metadata": {
    "type": "match_analysis",
    "matchPercentage": 72,
    "matchingSkills": ["Python"],
    "suggestedSkills": ["React", "TypeScript"],
    "improvedSkills": [
      {"original": "Python", "improved": "Python (Advanced)"}
    ],
    "projectedMatchPercentage": 83,
    "reasoning": "You have strong Python skills...",
    "userSkills": ["Python", "Dart"],
    "jobSkills": ["Python", "React", "TypeScript"],
    "jobDescription": "Full description...",
    "credits_used": 0
  }
}
```

**d) `missing_skills` Message (if user has no skills):**

```json
{
  "thread_id": "uuid",
  "role": "assistant",
  "content": "Please add skills to your profile to enable job matching.",
  "metadata": {
    "type": "missing_skills"
  }
}
```

## External Integration Guide

### Performing Analysis from External Sources

To perform job analysis from outside the chat interface (e.g., Chrome extension, API, webhook):

#### Step 1: Prepare Request

**Required Information:**

- Job description text (or LinkedIn URL)
- User ID (UUID)
- User skills (array of strings)

**Optional Information:**

- User profile data (for enhanced analysis)

#### Step 2: Make HTTP Request

**Example using cURL:**

```bash
curl -X POST https://your-project.supabase.co/functions/v1/job_analysis \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "jobInput": "We are looking for a Senior Software Engineer with experience in Python, React, and TypeScript. The ideal candidate will have 5+ years of experience...",
    "userId": "user-uuid-here",
    "userSkills": ["Python", "Dart", "Flutter"],
    "userProfile": {
      "fullName": "John Doe",
      "email": "john@example.com"
    }
  }'
```

**Example using JavaScript/TypeScript:**

```typescript
async function analyzeJob(jobDescription: string, userId: string, userSkills: string[]) {
  const response = await fetch('https://your-project.supabase.co/functions/v1/job_analysis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({
      jobInput: jobDescription,
      userId: userId,
      userSkills: userSkills,
    }),
  });

  if (!response.ok) {
    throw new Error(`Analysis failed: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Analysis failed');
  }

  return data.data;
}
```

**Example using Python:**

```python
import requests
import json

def analyze_job(job_description: str, user_id: str, user_skills: list):
    url = "https://your-project.supabase.co/functions/v1/job_analysis"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}",
        "apikey": anon_key,
    }
    payload = {
        "jobInput": job_description,
        "userId": user_id,
        "userSkills": user_skills,
    }
    
    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()
    
    data = response.json()
    if not data.get("success"):
        raise Exception(data.get("error", "Analysis failed"))
    
    return data["data"]
```

#### Step 3: Process Response

**Response Structure:**

```typescript
interface JobAnalysisResponse {
  success: boolean;
  data?: {
    jobData: {
      jobInfo: {
        title: string;
        company: string;
        description: string;
        location: string;
        experienceLevel?: string;
        employmentType?: string;
        jobFunctions?: string[];
        industries?: string[];
        skills?: string[];
      };
      companyInfo: {
        name: string;
        description?: string;
        industry?: string;
        companySize?: string;
        websiteUrl?: string;
        linkedInUrl?: string;
      };
    };
    matchAnalysis: {
      matchPercentage: number;
      matchingSkills: string[];
      reasoning: string;
      suggestedSkills?: string[];
      improvedSkills?: Array<{ skill: string; suggestion: string }>;
      projectedMatchPercentage?: number;
    };
    jobSkills: string[];
    isLinkedInUrl: boolean;
  };
  error?: string;
}
```

**Usage Example:**

```typescript
const result = await analyzeJob(description, userId, skills);

console.log('Job Title:', result.jobData.jobInfo.title);
console.log('Company:', result.jobData.jobInfo.company);
console.log('Match Percentage:', result.matchAnalysis.matchPercentage);
console.log('Matching Skills:', result.matchAnalysis.matchingSkills);
console.log('Suggested Skills:', result.matchAnalysis.suggestedSkills);
console.log('Reasoning:', result.matchAnalysis.reasoning);
```

### Environment Variables Required

**Edge Function Secrets (in Supabase Dashboard):**

- `DEEPSEEK_API_KEY`: Required for AI processing
- `APIFY_API_KEY`: Required only for LinkedIn URL scraping (optional for text analysis)
- `SUPABASE_URL`: Auto-provided by Supabase
- `SUPABASE_ANON_KEY`: Auto-provided by Supabase

### Rate Limiting & Timeouts

**Current Implementation:**

- Frontend timeout: 120 seconds
- Apify polling: Max 30 attempts (60 seconds total)
- No explicit rate limiting in edge function

**Recommendations for External Integration:**

- Implement retry logic with exponential backoff
- Handle timeout errors gracefully
- Cache results when possible to avoid duplicate API calls

### Cost Considerations

**AI API Calls Made:**

1. `parseJobDescription()` - 1 call (if text input)
2. `extractSkillsFromJobDescription()` - 1 call (if skills not in parsed result)
3. `calculateSkillMatch()` - 1 call (always)

**Total:** 2-3 AI API calls per analysis

**For LinkedIn URLs:**

- Additional Apify API call for scraping
- Then same AI processing as above

## Summary

### Key Points

1. **Edge Function is Stateless**: No database writes in the backend function
2. **Input Detection**: Automatically detects LinkedIn URL vs text description
3. **AI Processing**: Uses DeepSeek AI for parsing, skill extraction, and matching
4. **Response Format**: Structured JSON with job data and match analysis
5. **Database Operations**: Only performed by frontend after receiving response
6. **External Integration**: Can be called from any HTTP client with proper authentication

### Files Reference

**Backend:**

- Edge Function: `lib/supabase/functions/job_analysis/index.ts`
- Edge Function README: `lib/supabase/functions/job_analysis/README.md`

**Frontend:**

- Service: `lib/services/job_analysis_service.dart`
- Chat Orchestration: `lib/pages/chat/chat_workspace_page.dart`
- Job Parser: `lib/utils/job_parser.dart`

**Database:**

- Schema: `lib/supabase/supabase_tables.sql`
- Documentation: `supabase/DATABASE_SCHEMA_DOCUMENTATION.md`

**Documentation:**

- Job Analysis Docs: `docs/job_analysis.md`
- Database Schema: `supabase/DATABASE_SCHEMA_DOCUMENTATION.md`
