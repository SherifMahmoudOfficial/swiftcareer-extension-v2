# Database Schema Documentation

This document provides a comprehensive overview of the CareerPro database schema, including all tables, their purposes, message types, and job analysis functionality.

---

## Table of Contents

1. [Database Tables](#database-tables)
2. [Message Types System](#message-types-system)
3. [Job Analysis Functionality](#job-analysis-functionality)

---

## Database Tables

### 1. `users`

**Purpose:** Stores user profile information linked to Supabase authentication. This is the central table that connects to all user-related data.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): References `auth.users(id)`, serves as the foreign key for all user-related tables
- `email` (TEXT, UNIQUE): User's email address
- `full_name` (TEXT): User's full name
- `headline` (TEXT): Professional headline/tagline
- `summary` (TEXT): User's professional summary
- `skills` (TEXT[]): Array of user's skills, used for job matching
- `location` (TEXT): User's location
- `linkedin` (TEXT): LinkedIn profile URL
- `phone` (TEXT): Phone number
- `website` (TEXT): Personal website URL
- `preferred_cv_template` (TEXT): User's preferred CV template identifier
- `plan_tier` (TEXT): Subscription tier - `FREE`, `PRO`, `ELITE`, or `SPECIAL_ACCESS`
- `referral_code` (TEXT, UNIQUE): Unique referral code for the user
- `onboarding_completed` (BOOLEAN): Whether the user has completed onboarding
- `credits_balance` (INTEGER): Current available credits
- `credits_used` (INTEGER): Total credits used by the user
- `message_preferences` (JSONB): User preferences for which message types to receive
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps for record tracking

**Relationships:**
- Referenced by: `credits_transactions`, `cvs`, `saved_jobs`, `chat_threads`, `work_experiences`, `educations`, `certifications`, `languages`, `projects`, `awards`

---

### 2. `credits_transactions`

**Purpose:** Maintains a complete ledger of all credit transactions (additions and deductions) for audit and tracking purposes.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique transaction identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `amount` (INTEGER): Credit amount (positive for additions, negative for deductions)
- `balance_after` (INTEGER): User's credit balance after this transaction
- `source` (TEXT): Source of the transaction (e.g., "purchase", "referral", "usage")
- `reason` (TEXT): Human-readable reason for the transaction
- `cost_dollars` (NUMERIC): Cost in dollars if applicable
- `created_at` (TIMESTAMPTZ): Transaction timestamp

**Relationships:**
- References: `users`

---

### 3. `cvs`

**Purpose:** Stores generated CVs/resumes tailored for specific job applications.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique CV identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `title` (TEXT): CV title/name
- `content` (TEXT): Full CV content (formatted text)
- `job_url` (TEXT): URL of the job this CV was tailored for
- `cover_letter` (TEXT): Optional cover letter content
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Relationships:**
- References: `users`
- Indexed on: `user_id`, `created_at` (DESC)

---

### 4. `saved_jobs`

**Purpose:** Stores job listings that users have saved for later reference.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique saved job identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `job_title` (TEXT): Job title
- `company_name` (TEXT): Company name
- `location` (TEXT): Job location
- `job_url` (TEXT): URL to the job posting
- `job_data` (JSONB): Full job data as JSON (flexible structure for different job sources)
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Relationships:**
- References: `users`
- Indexed on: `user_id`, `created_at` (DESC)

---

### 5. `chat_threads`

**Purpose:** Represents conversation threads where users interact with the AI assistant about job applications, CV generation, and career advice.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique thread identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `title` (TEXT): Thread title (usually auto-generated from first message)
- `job_context` (TEXT): Context about the job being discussed
- `user_instructions` (TEXT): User-provided custom instructions for this thread
- `focus_label` (TEXT): Label indicating the focus of the conversation
- `thread_memory` (TEXT): AI-generated memory/context summary for the thread
- `thread_memory_updated_at` (TIMESTAMPTZ): When the memory was last updated
- `thread_memory_message_count` (INTEGER): Number of messages when memory was created
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Relationships:**
- References: `users`
- Referenced by: `chat_messages`
- Indexed on: `user_id`, `updated_at` (DESC)

---

### 6. `chat_messages`

**Purpose:** Stores individual messages within chat threads. Messages can be from users or the AI assistant, and include metadata for rendering different message types.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique message identifier
- `thread_id` (UUID, FOREIGN KEY): References `chat_threads(id)`
- `role` (TEXT): Message role - `'user'` or `'assistant'`
- `content` (TEXT): Message text content
- `metadata` (JSONB): Flexible JSON structure containing:
  - `type`: Message type (e.g., `'cv'`, `'match_analysis'`, `'job_results'`)
  - `credits_used`: Credits consumed for this message
  - Type-specific data (varies by message type)
- `created_at` (TIMESTAMPTZ): Message timestamp

**Relationships:**
- References: `chat_threads`
- Indexed on: `thread_id`, `created_at`

**Note:** The `metadata` field is crucial for the message type system. See [Message Types System](#message-types-system) for details.

---

### 7. `work_experiences`

**Purpose:** Stores user's work experience history for CV generation and profile building.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique experience identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `company` (TEXT): Company name
- `position` (TEXT): Job title/position
- `start_date` (DATE): Employment start date
- `end_date` (DATE): Employment end date (NULL if current)
- `description` (TEXT): Job description/responsibilities
- `current` (BOOLEAN): Whether this is the current position
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Relationships:**
- References: `users`
- Indexed on: `user_id`

---

### 8. `educations`

**Purpose:** Stores user's educational background.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique education identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `institution` (TEXT): School/university name
- `degree` (TEXT): Degree obtained (e.g., "Bachelor of Science")
- `field` (TEXT): Field of study
- `start_date` (DATE): Education start date
- `end_date` (DATE): Graduation date
- `gpa` (TEXT): GPA (stored as text for flexibility)
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Relationships:**
- References: `users`
- Indexed on: `user_id`

---

### 9. `certifications`

**Purpose:** Stores user's professional certifications.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique certification identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `name` (TEXT): Certification name
- `issuer` (TEXT): Issuing organization
- `issue_date` (DATE): Date issued
- `expiry_date` (DATE): Expiration date (NULL if no expiration)
- `credential_url` (TEXT): URL to verify the credential
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Relationships:**
- References: `users`
- Indexed on: `user_id`

---

### 10. `languages`

**Purpose:** Stores user's language proficiencies.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique language identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `language` (TEXT): Language name
- `proficiency_level` (TEXT): Proficiency level - `'Beginner'`, `'Intermediate'`, `'Advanced'`, `'Native'`, or `'Fluent'`
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Relationships:**
- References: `users`
- Indexed on: `user_id`

---

### 11. `projects`

**Purpose:** Stores user's portfolio projects.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique project identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `name` (TEXT): Project name
- `description` (TEXT): Project description
- `technologies` (TEXT[]): Array of technologies used
- `url` (TEXT): Project URL (if available)
- `start_date` (DATE): Project start date
- `end_date` (DATE): Project end date
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Relationships:**
- References: `users`
- Indexed on: `user_id`

---

### 12. `awards`

**Purpose:** Stores user's awards and achievements.

**Key Fields:**
- `id` (UUID, PRIMARY KEY): Unique award identifier
- `user_id` (UUID, FOREIGN KEY): References `users(id)`
- `title` (TEXT): Award title
- `issuer` (TEXT): Organization that issued the award
- `date` (DATE): Award date
- `description` (TEXT): Award description
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Relationships:**
- References: `users`
- Indexed on: `user_id`

---

## Message Types System

The application uses a message type system where each message in `chat_messages` has a `metadata.type` field that determines how it's rendered in the UI. This system allows for rich, interactive message widgets beyond simple text.

### Message Type Configuration

Message types are controlled globally via `lib/config/message_types_config.dart`. Each type can be enabled or disabled, affecting whether messages of that type are generated and displayed.

### Enabled Message Types

#### Content Generation Types

1. **`cv`**
   - **Purpose:** Displays a tailored CV/resume generated for a specific job
   - **When Used:** After user requests CV generation or job analysis triggers CV creation
   - **Widget:** `CvMessage` - Shows CV with download and regenerate options
   - **Metadata:** Contains CV content, job URL, and credits used

2. **`cover_letter`**
   - **Purpose:** Displays a generated cover letter
   - **When Used:** When user requests cover letter generation
   - **Widget:** `CoverLetterMessage` - Shows cover letter with download options
   - **Metadata:** Contains cover letter content and related job information

3. **`interview_qa`**
   - **Purpose:** Provides interview questions and suggested answers
   - **When Used:** When user requests interview preparation
   - **Widget:** `InterviewQACard` - Interactive Q&A display
   - **Metadata:** Contains array of questions and answers

4. **`portfolio`**
   - **Purpose:** Displays generated portfolio website
   - **When Used:** When user requests portfolio generation
   - **Widget:** `PortfolioMessage` - Shows portfolio preview with view/edit options
   - **Metadata:** Contains portfolio URL and generation details

#### Job Analysis Types

5. **`match_analysis`**
   - **Purpose:** Displays job match analysis with skill matching, suggestions, and projected match percentage
   - **When Used:** After job analysis is performed
   - **Widget:** `MatchAnalysisMessage` - Renders `SkillsKeywordsPanel` with match score, matching skills, suggested skills, and improvements
   - **Metadata:** Contains:
     - `matchPercentage`: Current match percentage (0-100)
     - `matchingSkills`: Array of skills that match
     - `suggestedSkills`: Array of skills to learn
     - `improvedSkills`: Array of objects with original/improved skill suggestions
     - `projectedMatchPercentage`: Projected match after improvements
     - `reasoning`: AI explanation of the match

6. **`job_results`**
   - **Purpose:** Displays extracted job information (title, company, location, badges)
   - **When Used:** When job data is successfully extracted from a URL or description
   - **Widget:** `JobResultsMessage` - Renders `JobHeaderCard` with job details
   - **Metadata:** Contains `jobResult` object with title, company, location, level, remote status, type, etc.

7. **`optimization`**
   - **Purpose:** Provides job optimization suggestions
   - **When Used:** When user requests optimization advice
   - **Widget:** Generic assistant bubble with optimization tips
   - **Metadata:** Contains optimization suggestions and recommendations

#### Network Types

8. **`network_intro`**
   - **Purpose:** Provides network introduction message templates
   - **When Used:** When user requests networking help
   - **Widget:** `NetworkIntroMessage` - Shows introduction templates with copy options
   - **Metadata:** Contains introduction templates and styles

9. **`network`** (Currently Disabled)
   - **Purpose:** Network contacts/people finder
   - **Status:** Disabled in configuration
   - **Note:** This feature is not currently active

#### Status/Utility Types

10. **`analyzing`**
    - **Purpose:** Shows analysis in progress indicator
    - **When Used:** During job analysis or AI processing
    - **Widget:** `AnalyzingMessage` - Simple assistant bubble with loading text
    - **Metadata:** Minimal - just type identifier

11. **`portfolio_generating`**
    - **Purpose:** Shows portfolio generation in progress
    - **When Used:** During portfolio generation
    - **Widget:** `PortfolioGeneratingMessage` - Loading indicator for portfolio
    - **Metadata:** Generation status information

12. **`insufficient_credits`**
    - **Purpose:** Warns user when they don't have enough credits
    - **When Used:** When a credit-required operation fails due to insufficient balance
    - **Widget:** `InsufficientCreditsMessage` - Warning card with credit purchase CTA
    - **Metadata:** Contains required credits and current balance

13. **`missing_skills`**
    - **Purpose:** Reminds user to add skills to their profile
    - **When Used:** When job analysis is attempted but user has no skills in profile
    - **Widget:** `MissingSkillsMessage` - Card with "Add skills now" button
    - **Metadata:** Minimal - redirects to profile edit page

#### Follow-up Flow Types

14. **`followup_apply`**
    - **Purpose:** Provides follow-up action buttons after CV/cover letter generation
    - **When Used:** After generating application materials
    - **Widget:** `FollowupApplyMessage` - Action buttons for next steps
    - **Metadata:** Contains follow-up actions and job context

15. **`followup_answer`**
    - **Purpose:** Follow-up answer messages in conversation flow
    - **When Used:** In multi-step conversation flows
    - **Widget:** Generic assistant bubble
    - **Metadata:** Contains answer context

16. **`followup_clarification`**
    - **Purpose:** Requests clarification from user
    - **When Used:** When AI needs more information to proceed
    - **Widget:** Generic assistant bubble with clarification request
    - **Metadata:** Contains what needs clarification

17. **`followup_error`**
    - **Purpose:** Error messages in follow-up flows
    - **When Used:** When errors occur in conversation flows
    - **Widget:** Generic assistant bubble with error styling
    - **Metadata:** Contains error details

#### Instructional Types

18. **`instructions_confirmation`**
    - **Purpose:** Confirms user instructions were received
    - **When Used:** When user provides custom instructions
    - **Widget:** Generic assistant bubble
    - **Metadata:** Contains confirmed instructions

19. **`job_link_reminder`**
    - **Purpose:** Reminds user to provide job link
    - **When Used:** When job analysis is requested but no job link is provided
    - **Widget:** Generic assistant bubble
    - **Metadata:** Minimal reminder message

### Message Widget Factory

Messages are rendered using the factory pattern in `lib/widgets/chat/messages/message_widget_factory.dart`. The factory:
1. Reads `metadata['type']` from the message
2. Checks if the type is enabled in `MessageTypesConfig`
3. Maps the type to the appropriate widget via a switch statement
4. Returns the widget for rendering

### Message Structure

All messages follow this structure:

```json
{
  "id": "uuid",
  "thread_id": "uuid",
  "role": "user" | "assistant",
  "content": "Message text content",
  "metadata": {
    "type": "message_type",
    "credits_used": 0,
    // ... type-specific metadata
  },
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## Job Analysis Functionality

Job analysis is a core feature that extracts job information, matches user skills, and provides actionable insights. This section explains how it works end-to-end.

### High-Level Architecture

Job analysis consists of two main components:

1. **Frontend (Flutter)**
   - Collects user input (LinkedIn URL or job description text)
   - Fetches user skills from profile
   - Calls analysis service
   - Displays results as interactive message widgets
   - Manages caching and user experience

2. **Backend (Supabase Edge Function: `job_analysis`)**
   - Determines input type (LinkedIn URL vs text)
   - Scrapes LinkedIn jobs via Apify (if URL provided)
   - Parses job descriptions using AI
   - Extracts job skills
   - Calculates skill match using AI
   - Returns structured analysis results

### Data Flow

```
User Input (LinkedIn URL or Text)
    ↓
Frontend: JobAnalysisService
    ↓
Backend: Supabase Edge Function (job_analysis)
    ↓
[If LinkedIn URL] → Apify Scraper → Job Data
[If Text] → AI Parser → Structured Job Data
    ↓
AI: Extract Skills from Job Description
    ↓
AI: Calculate Skill Match (userSkills vs jobSkills)
    ↓
Return: Job Data + Match Analysis
    ↓
Frontend: Display as Message Types (job_results, match_analysis)
```

### Input Types

#### LinkedIn URL
- Format: `https://linkedin.com/jobs/view/...` or `https://www.linkedin.com/jobs/...`
- Processing:
  1. Edge function detects LinkedIn URL pattern
  2. Runs Apify actor to scrape job data
  3. Polls for completion
  4. Extracts `jobInfo` and `companyInfo` from dataset
  5. Extracts skills (from scraper or via AI if missing)

#### Text Description
- Format: Plain text job description
- Processing:
  1. Edge function detects text input
  2. Uses AI (`parseJobDescription`) to extract structured fields:
     - Title, company, location
     - Experience level, employment type
     - Job functions, industries
     - Skills
  3. Falls back to AI skill extraction if skills not found in parsing

### Skill Matching Process

The system performs intelligent skill matching:

1. **Input:**
   - `userSkills`: Array from user profile
   - `jobSkills`: Array extracted from job description
   - `jobDescription`: Full job description text

2. **AI Analysis (`calculateSkillMatch`):**
   - Compares user skills with job requirements
   - Calculates match percentage (0-100)
   - Identifies matching skills
   - Suggests missing skills to learn
   - Provides skill improvement suggestions (e.g., "Python" → "Python (Advanced)")
   - Projects match percentage after improvements
   - Generates reasoning explanation

3. **Output:**
   ```json
   {
     "matchPercentage": 72,
     "matchingSkills": ["Python", "React", "TypeScript"],
     "suggestedSkills": ["Docker", "Kubernetes"],
     "reasoning": "You have strong frontend skills...",
     "improvedSkills": [
       {"original": "Python", "improved": "Python (Advanced)"}
     ],
     "projectedMatchPercentage": 83
   }
   ```

### Related Message Types

Job analysis triggers several message types in sequence:

1. **`analyzing`** - Shows "Analyzing job..." while processing
2. **`job_results`** - Displays extracted job information (title, company, location)
3. **`match_analysis`** - Shows match percentage, skills, and suggestions
4. **`missing_skills`** - Appears if user has no skills in profile (blocks analysis)

### Frontend Implementation

**Key Files:**
- `lib/services/job_analysis_service.dart` - Service for calling edge function
- `lib/utils/job_parser.dart` - Parses user input to determine type
- `lib/pages/chat/chat_workspace_page.dart` - Orchestrates analysis flow
- `lib/widgets/job/job_header_card.dart` - UI components for job display

**Service Call Example:**
```dart
final result = await JobAnalysisService.analyzeJob(
  jobInput: userInput,
  userSkills: userSkills,
  userId: userId,
  userProfile: userProfile,
);
```

### Backend Implementation

**Key Files:**
- `lib/supabase/functions/job_analysis/index.ts` - Edge function implementation

**Functions:**
- `isLinkedInUrl(input)` - Detects LinkedIn URL pattern
- `parseJobDescription(text)` - AI-powered job parsing
- `extractSkillsFromJobDescription(description)` - AI skill extraction
- `calculateSkillMatch(userSkills, jobSkills, description)` - AI match calculation

**Response Format:**
```json
{
  "success": true,
  "data": {
    "jobData": {
      "jobInfo": {
        "title": "Software Engineer",
        "company": "Tech Corp",
        "description": "...",
        "location": "San Francisco, CA",
        "experienceLevel": "Mid-Senior level",
        "employmentType": "Full-time",
        "jobFunctions": ["Engineering"],
        "industries": ["Technology"],
        "skills": ["Python", "React"]
      },
      "companyInfo": {
        "name": "Tech Corp",
        "description": "...",
        "industry": "Technology",
        "companySize": "1000-5000",
        "websiteUrl": "https://...",
        "linkedInUrl": "https://..."
      }
    },
    "matchAnalysis": {
      "matchPercentage": 72,
      "matchingSkills": ["..."],
      "suggestedSkills": ["..."],
      "reasoning": "...",
      "improvedSkills": [...],
      "projectedMatchPercentage": 83
    },
    "jobSkills": ["Python", "React", "TypeScript"],
    "isLinkedInUrl": true
  }
}
```

### Error Handling

- **Frontend:** Errors are logged and displayed via error message types
- **Backend:** Errors return `success: false` with error message
- **Fallbacks:** UI gracefully handles missing data with fallback displays

### Caching

The system supports caching of analysis results:
- `cachedSuggestedSkills` - Cached skill suggestions
- `cachedImprovedSkills` - Cached skill improvements
- `cachedProjectedMatchPercentage` - Cached projected match

This prevents redundant API calls when displaying the same analysis multiple times.

---

## Additional Resources

- **Database Schema SQL:** `lib/supabase/supabase_tables.sql`
- **Message Types Config:** `lib/config/message_types_config.dart`
- **Message Widget Factory:** `lib/widgets/chat/messages/message_widget_factory.dart`
- **Job Analysis Service:** `lib/services/job_analysis_service.dart`
- **Job Analysis Edge Function:** `lib/supabase/functions/job_analysis/index.ts`
- **Detailed Job Analysis Docs:** `docs/job_analysis.md`

---

*Last Updated: 2024*
