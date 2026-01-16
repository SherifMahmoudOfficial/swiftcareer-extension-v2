/**
 * API Utilities
 * Handles calls to Supabase Edge Functions and database operations
 */

import { getSupabaseClient, getAccessToken } from './supabase.js';
import { Storage } from './storage.js';
import { hasEnoughCredits, deductCredits } from './credits_service.js';
import { calculateJobAnalysisCost, calculateCostFromUsage, costToCredits } from './cost_calculator.js';
import { deepSeekJsonObject, isDeepSeekConfigured } from './deepseek_client.js';

/**
 * Simple URL detection
 */
function isLinkedInUrl(input) {
  const trimmed = input.trim().toLowerCase();
  return trimmed.includes('linkedin.com/jobs/');
}

/**
 * Extract skills from job description using DeepSeek
 */
async function extractSkillsFromJobDescription(description) {
  console.log('[API] 🤖 Extracting skills from job description');
  
  const systemPrompt = `You are a skill extraction expert. Extract all technical skills, soft skills, tools, and technologies mentioned in the job description. Return ONLY valid JSON.`;
  
  const userPrompt = `Extract all skills from this job description:\n\n${description}\n\nReturn JSON: { "skills": ["skill1", "skill2", ...] }`;

  const result = await deepSeekJsonObject({
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    label: 'Extract Skills'
  });

  return {
    skills: result.parsed.skills || [],
    usage: result.usage
  };
}

/**
 * Parse job description using DeepSeek
 */
async function parseJobDescription(jobDescription) {
  console.log('[API] 🤖 Parsing job description');
  
  const systemPrompt = `You are a job description parser. Extract structured information from job postings. Return ONLY valid JSON.`;
  
  const userPrompt = `Parse this job description and extract:

${jobDescription}

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
}`;

  const result = await deepSeekJsonObject({
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    label: 'Parse Job'
  });

  return {
    parsed: result.parsed,
    usage: result.usage
  };
}

/**
 * Calculate skill match using DeepSeek
 */
async function calculateSkillMatch(userSkills, jobSkills, jobDescription) {
  console.log('[API] 🤖 Calculating skill match');
  
  const systemPrompt = `You are a professional skill matching expert. Analyze how well a candidate's skills match job requirements. Consider:
1. Direct skill matches (exact or similar terms)
2. Transferable skills (related skills that could apply)
3. Skill gaps (missing required skills)
4. How to rephrase existing skills to better match job requirements

Return ONLY valid JSON with this structure:
{
  "matchPercentage": number (0-100),
  "matchingSkills": ["skill1", "skill2"],
  "reasoning": "detailed explanation of the match",
  "suggestedSkills": ["missing skill 1", "missing skill 2"],
  "improvedSkills": [
    {"original": "user's existing skill", "improved": "rephrased to better match job requirements"}
  ],
  "projectedMatchPercentage": number (expected match after improvements, 0-100)
}`;

  const userPrompt = `Analyze skill match:

User Skills: ${userSkills.join(', ')}

Job Required Skills: ${jobSkills.join(', ')}

Job Description:
${jobDescription}

Calculate:
1. Match percentage based on direct and transferable skills
2. List all matching skills (including synonyms/related skills)
3. Provide reasoning for the match score
4. Suggest missing skills the user should add to improve match
5. For user's existing skills that partially match, rephrase them to better align with job terminology (e.g., "Python" → "Python (Advanced - Data Analysis)")
6. Estimate projected match if user improves their profile

Return the analysis as JSON.`;

  const result = await deepSeekJsonObject({
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    label: 'Skill Match'
  });

  const parsed = result.parsed;
  
  return {
    matchPercentage: Math.max(0, Math.min(100, parsed.matchPercentage || 0)),
    matchingSkills: parsed.matchingSkills || [],
    reasoning: parsed.reasoning || '',
    suggestedSkills: parsed.suggestedSkills || [],
    improvedSkills: parsed.improvedSkills || [],
    projectedMatchPercentage: Math.max(0, Math.min(100, parsed.projectedMatchPercentage || 0)),
    usage: result.usage
  };
}

/**
 * Call job analysis locally using DeepSeek (no backend)
 * Matches Flutter logic exactly
 */
export async function callJobAnalysis(jobInput, userId, userSkills = [], userProfile = {}) {
  console.log('[API] 🚀 Starting local job analysis (client-side)');
  
  // Check if DeepSeek is configured
  const isConfigured = await isDeepSeekConfigured();
  if (!isConfigured) {
    throw new Error('DeepSeek API key not configured. Please set it in Settings.');
  }
  
  // Check credits before starting (require at least 1 credit)
  const canStart = await hasEnoughCredits(1, userId);
  if (!canStart) {
    console.error('[API] ❌ Insufficient credits');
    throw new Error('INSUFFICIENT_CREDITS');
  }

  const isLinkedIn = isLinkedInUrl(jobInput);
  console.log('[API] 📋 Input type:', { isLinkedIn, inputLength: jobInput.length });
  
  let jobData;
  let jobSkills = [];
  const tokenUsageOperations = [];
  let usedApify = false;

  // For LinkedIn URLs, we'll treat the input as text (user should paste description)
  // In future, we can add content script to extract from page
  let jobDescription = jobInput;
  
  if (isLinkedIn) {
    // For now, treat LinkedIn URL as text input
    // User should paste the job description
    console.log('[API] ⚠️ LinkedIn URL detected - treating as text input. User should paste job description.');
    jobDescription = jobInput;
  }

  // Parse job description
  console.log('[API] 📝 Parsing job description');
  const parseResult = await parseJobDescription(jobDescription);
  const parsedJob = parseResult.parsed;
  tokenUsageOperations.push({ operation: 'parse_job', usage: parseResult.usage });
  
  // Deduct credits for parse_job operation
  try {
    const parseCost = calculateCostFromUsage(parseResult.usage, 'Job Analysis: parse_job');
    const parseCredits = parseCost.credits;
    if (parseCredits > 0) {
      const deducted = await deductCredits({
        credits: parseCredits,
        reason: 'Job Analysis: parse_job',
        userId: userId,
        source: 'deepseek',
        costDollars: parseCost.totalCost
      });
      if (deducted) {
        console.log('[API] ✅ Credits deducted for parse_job:', parseCredits);
      } else {
        console.error('[API] ⚠️ Failed to deduct credits for parse_job');
      }
    }
  } catch (parseCreditError) {
    console.error('[API] ❌ Error deducting credits for parse_job:', parseCreditError);
  }
  
  jobData = {
    jobInfo: {
      title: parsedJob.title || '',
      company: parsedJob.company || '',
      description: parsedJob.description || jobDescription,
      location: parsedJob.location || '',
      experienceLevel: parsedJob.experienceLevel || '',
      employmentType: parsedJob.employmentType || '',
      jobFunctions: parsedJob.jobFunctions || [],
      industries: parsedJob.industries || [],
      skills: parsedJob.skills || []
    },
    companyInfo: {
      name: parsedJob.company || '',
      description: '',
      industry: parsedJob.industries?.[0] || '',
      companySize: '',
      websiteUrl: '',
      linkedInUrl: ''
    }
  };
  
  // Extract skills if not in parsed job
  if (parsedJob.skills && parsedJob.skills.length > 0) {
    jobSkills = parsedJob.skills;
    console.log('[API] ✅ Using skills from parsed job:', { count: jobSkills.length });
  } else {
    console.log('[API] 🔍 No skills in parsed job, extracting from description...');
    const skillsResult = await extractSkillsFromJobDescription(jobDescription);
    jobSkills = skillsResult.skills;
    tokenUsageOperations.push({ operation: 'extract_skills', usage: skillsResult.usage });
    console.log('[API] ✅ Extracted skills:', { count: jobSkills.length });
    
    // Deduct credits for extract_skills operation
    try {
      const skillsCost = calculateCostFromUsage(skillsResult.usage, 'Job Analysis: extract_skills');
      const skillsCredits = skillsCost.credits;
      if (skillsCredits > 0) {
        const deducted = await deductCredits({
          credits: skillsCredits,
          reason: 'Job Analysis: extract_skills',
          userId: userId,
          source: 'deepseek',
          costDollars: skillsCost.totalCost
        });
        if (deducted) {
          console.log('[API] ✅ Credits deducted for extract_skills:', skillsCredits);
        } else {
          console.error('[API] ⚠️ Failed to deduct credits for extract_skills');
        }
      }
    } catch (skillsCreditError) {
      console.error('[API] ❌ Error deducting credits for extract_skills:', skillsCreditError);
    }
  }

  // Calculate skill match
  let matchAnalysis = null;
  if (userSkills && userSkills.length > 0) {
    console.log('[API] 🎯 Calculating skill match');
    matchAnalysis = await calculateSkillMatch(userSkills, jobSkills, jobDescription);
    tokenUsageOperations.push({ operation: 'skill_match', usage: matchAnalysis.usage });
    
    // Deduct credits for skill_match operation
    try {
      const matchCost = calculateCostFromUsage(matchAnalysis.usage, 'Job Analysis: skill_match');
      const matchCredits = matchCost.credits;
      if (matchCredits > 0) {
        const deducted = await deductCredits({
          credits: matchCredits,
          reason: 'Job Analysis: skill_match',
          userId: userId,
          source: 'deepseek',
          costDollars: matchCost.totalCost
        });
        if (deducted) {
          console.log('[API] ✅ Credits deducted for skill_match:', matchCredits);
        } else {
          console.error('[API] ⚠️ Failed to deduct credits for skill_match');
        }
      }
    } catch (matchCreditError) {
      console.error('[API] ❌ Error deducting credits for skill_match:', matchCreditError);
    }
  }

  // Calculate total token usage
  const totalUsage = tokenUsageOperations.reduce((acc, op) => {
    return {
      prompt_tokens: acc.prompt_tokens + (op.usage.prompt_tokens || 0),
      completion_tokens: acc.completion_tokens + (op.usage.completion_tokens || 0),
      total_tokens: acc.total_tokens + (op.usage.total_tokens || 0),
      cached_tokens: (acc.cached_tokens || 0) + (op.usage.cached_tokens || 0)
    };
  }, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0 });

  const tokenUsage = {
    total: totalUsage,
    operations: tokenUsageOperations
  };

  // Build response structure (same as edge function)
  const analysisResult = {
    jobData,
    matchAnalysis: matchAnalysis || {
      matchPercentage: 0,
      matchingSkills: [],
      reasoning: 'No user skills provided',
      suggestedSkills: [],
      improvedSkills: [],
      projectedMatchPercentage: 0
    },
    jobSkills,
    isLinkedInUrl: isLinkedIn,
    tokenUsage: tokenUsage,
    usedApify: usedApify
  };

  // Calculate total credits used (sum of per-operation deductions)
  // Note: Credits are already deducted per operation above, this is just for tracking
  let totalCreditsUsed = 0;
  const creditsUsedBreakdown = {};
  
  // Calculate breakdown for reporting (credits already deducted above)
  for (const op of tokenUsageOperations) {
    try {
      const opCost = calculateCostFromUsage(op.usage, `Job Analysis: ${op.operation}`);
      const opCredits = opCost.credits;
      totalCreditsUsed += opCredits;
      creditsUsedBreakdown[op.operation] = opCredits;
    } catch (e) {
      console.error(`[API] ❌ Error calculating credits for ${op.operation}:`, e);
    }
  }
  
  // Store breakdown and total
  analysisResult.creditsUsed = totalCreditsUsed;
  analysisResult.creditsUsedBreakdown = creditsUsedBreakdown;
  
  console.log('[API] 💰 Total credits used for job analysis:', {
    totalCredits: totalCreditsUsed,
    breakdown: creditsUsedBreakdown,
    operations: tokenUsageOperations.length
  });

  console.log('[API] ✅ Job analysis completed successfully');
  return analysisResult;
}

/**
 * Check if job already exists in saved_jobs table
 */
export async function checkJobExists(jobUrl, userId) {
  console.log('[API] 🔍 Checking if job exists in database:', { jobUrl, userId });
  const client = await getSupabaseClient();
  
  try {
    const data = await client
      .from('saved_jobs')
      .select('id, job_title, company_name, created_at')
      .eq('user_id', userId)
      .eq('job_url', jobUrl)
      .maybeSingle();

    console.log('[API] 📊 Database query result:', { 
      found: !!data, 
      jobId: data?.id, 
      jobTitle: data?.job_title,
      companyName: data?.company_name 
    });
    return data;
  } catch (error) {
    console.error('[API] ❌ Database query error:', error);
    throw error;
  }
}

/**
 * Save job to saved_jobs table
 */
export async function saveJobToDatabase(jobData, userId) {
  console.log('[API] 💾 Saving job to database:', { userId, jobUrl: jobData.jobUrl });
  const client = await getSupabaseClient();
  
  const jobInfo = jobData.jobData?.jobInfo || {};
  const companyInfo = jobData.jobData?.companyInfo || {};

  const savedJob = {
    user_id: userId,
    job_title: jobInfo.title || '',
    company_name: jobInfo.company || companyInfo.name || '',
    location: jobInfo.location || '',
    job_url: jobData.jobUrl || '',
    job_data: {
      jobData: jobData.jobData,
      matchAnalysis: jobData.matchAnalysis,
      jobSkills: jobData.jobSkills,
      isLinkedInUrl: jobData.isLinkedInUrl
    }
  };

  console.log('[API] 📤 Database insert data:', {
    user_id: savedJob.user_id,
    job_title: savedJob.job_title,
    company_name: savedJob.company_name,
    location: savedJob.location,
    job_url: savedJob.job_url,
    hasJobData: !!savedJob.job_data.jobData,
    hasMatchAnalysis: !!savedJob.job_data.matchAnalysis,
    jobSkillsCount: savedJob.job_data.jobSkills?.length || 0
  });

  try {
    const data = await client
      .from('saved_jobs')
      .insert(savedJob);
    
    console.log('[API] ✅ Job saved to database successfully:', data);
    return data;
  } catch (error) {
    console.error('[API] ❌ Database insert error:', error);
    throw error;
  }
}

/**
 * Get user profile data for job analysis
 */
export async function getUserProfile(userId) {
  console.log('[API] 👤 Fetching user profile from database:', { userId });
  const client = await getSupabaseClient();
  
  try {
    const data = await client
      .from('users')
      .select('id, email, full_name, headline, summary, location, linkedin, phone, website, skills')
      .eq('id', userId)
      .single();
    
    console.log('[API] 📊 User profile fetched:', {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      hasHeadline: !!data.headline,
      hasSummary: !!data.summary,
      skillsCount: data.skills?.length || 0
    });
    
    return data;
  } catch (error) {
    console.error('[API] ❌ Database query error (getUserProfile):', error);
    throw error;
  }
}

/**
 * Create or update a chat thread for a job
 */
export async function createOrUpdateChatThread(userId, jobUrl, jobTitle, companyName) {
  console.log('[API] 💬 Creating or updating chat thread:', { userId, jobUrl, jobTitle, companyName });
  const client = await getSupabaseClient();
  
  if (!client) {
    throw new Error('Supabase client not initialized');
  }
  
    try {
      // Search for existing thread with same job_url
      let existingThread = null;
      
      try {
        // maybeSingle returns the data directly (null if not found, or the object if found)
        existingThread = await client
          .from('chat_threads')
          .select('id')
          .eq('user_id', userId)
          .eq('job_context', jobUrl)
          .maybeSingle();
      } catch (searchErr) {
        console.warn('[API] ⚠️ Exception while searching for thread:', searchErr);
        // Continue to create new thread if search fails
      }
    
    if (existingThread && existingThread.id) {
      // Update existing thread
      console.log('[API] 🔄 Updating existing thread:', existingThread.id);
      const updatedThread = await client
        .from('chat_threads')
        .update({
          updated_at: new Date().toISOString(),
          title: jobTitle ? `${jobTitle} at ${companyName}` : 'Job Application'
        })
        .eq('id', existingThread.id)
        .select()
        .single();
      
      if (!updatedThread) {
        throw new Error('Failed to update thread: no data returned');
      }
      
      console.log('[API] ✅ Thread updated successfully');
      return updatedThread;
    } else {
      // Create new thread
      console.log('[API] ➕ Creating new thread');
      const newThread = await client
        .from('chat_threads')
        .insert({
          user_id: userId,
          title: jobTitle ? `${jobTitle} at ${companyName}` : 'New Job Application',
          job_context: jobUrl,
          focus_label: jobTitle || 'Job Application'
        })
        .select()
        .single();
      
      if (!newThread) {
        throw new Error('Failed to create thread: no data returned');
      }
      
      console.log('[API] ✅ Thread created successfully:', newThread.id);
      return newThread;
    }
  } catch (error) {
    console.error('[API] ❌ Database error (createOrUpdateChatThread):', error);
    throw error;
  }
}

/**
 * Create a single chat message
 */
export async function createChatMessage(threadId, role, content, metadata = null, userId = null) {
  console.log('[API] 📝 Creating chat message:', { threadId, role, contentLength: content?.length || 0, userId });
  const client = await getSupabaseClient();
  
  if (!userId) {
    throw new Error('userId is required for creating chat messages');
  }
  
  try {
    const message = await client
      .from('chat_messages')
      .insert({
        thread_id: threadId,
        role: role, // 'user' or 'assistant'
        content: content || '',
        metadata: metadata,
        user_id: userId
      })
      .select()
      .single();
    
    if (!message) {
      throw new Error('Failed to create message: no data returned');
    }
    
    console.log('[API] ✅ Message created successfully:', message.id);
    return message;
  } catch (error) {
    console.error('[API] ❌ Database error (createChatMessage):', error);
    throw error;
  }
}

/**
 * Create a portfolio message in chat_messages (assistant bubble).
 * Mirrors Flutter's persisted metadata shape for portfolio.
 */
export async function createPortfolioMessage(
  threadId,
  portfolioUrl,
  portfolioTitle,
  creditsUsed,
  userId,
  extra = null
) {
  const metadata = {
    type: 'portfolio',
    portfolio_url: portfolioUrl,
    portfolio_title: portfolioTitle,
    credits_used: creditsUsed || 0,
    ...(extra && typeof extra === 'object' ? extra : {})
  };

  const content =
    'Your animated portfolio landing page is ready! Click the button below to open it in a new tab.';

  return await createChatMessage(
    threadId,
    'assistant',
    content,
    metadata,
    userId
  );
}

/**
 * Create all job analysis messages (user, analyzing, job_results, match_analysis/missing_skills)
 */
export async function createJobAnalysisMessages(threadId, jobDescription, analysisResult, userSkills, jobUrl = '', userId) {
  console.log('[API] 📨 Creating job analysis messages for thread:', threadId);
  const messages = [];
  
  if (!userId) {
    throw new Error('userId is required for creating job analysis messages');
  }
  
  try {
    // 1. User Message
    console.log('[API] 📝 Creating user message');
    const userMessage = await createChatMessage(
      threadId,
      'user',
      jobDescription,
      null,
      userId
    );
    messages.push(userMessage);
    
    // 2. Analyzing Message
    console.log('[API] 📝 Creating analyzing message');
    const analyzingMessage = await createChatMessage(
      threadId,
      'assistant',
      'Analyzing job...',
      { type: 'analyzing' },
      userId
    );
    messages.push(analyzingMessage);
    
    const jobInfo = analysisResult.jobData?.jobInfo || {};
    const matchAnalysis = analysisResult.matchAnalysis || {};
    const creditsUsed = analysisResult.creditsUsed || 0;
    
    // 3. Job Results Message
    console.log('[API] 📝 Creating job_results message');
    // IMPORTANT: Flutter expects metadata.jobAnalysis to contain a nested jobResult map.
    // Keep this shape aligned with `careerpro/lib/pages/chat/chat_workspace_page.dart`
    // restore logic (it casts jobAnalysis['jobResult'] to Map<String, dynamic>).
    const jobResultPayload = {
      title: jobInfo.title || '',
      company: jobInfo.company || '',
      location: jobInfo.location || '',
      level: jobInfo.experienceLevel || '',
      remote: false, // Can be extracted from jobInfo if available
      type: jobInfo.employmentType || ''
    };
    const jobAnalysisPayload = {
      jobResult: jobResultPayload,
      jobLink: jobUrl || '',
      jobDescription: jobInfo.description || jobDescription,
      jobSkills: analysisResult.jobSkills || [],
      userSkills: userSkills || [],
      skills: jobInfo.skills || analysisResult.jobSkills || [],
      // Flutter restore expects these keys; provide safe defaults for extension threads.
      people: [],
      introMessage: null
    };
    const jobResultsMessage = await createChatMessage(
      threadId,
      'assistant',
      'Job analyzed successfully',
      {
        type: 'job_results',
        jobResult: jobResultPayload,
        jobAnalysis: jobAnalysisPayload,
        jobLink: jobUrl || '',
        credits_used: creditsUsed
      },
      userId
    );
    messages.push(jobResultsMessage);
    
    // 4. Match Analysis Message (or missing_skills if no skills)
    if (!userSkills || userSkills.length === 0) {
      console.log('[API] 📝 Creating missing_skills message');
      const missingSkillsMessage = await createChatMessage(
        threadId,
        'assistant',
        'Please add skills to your profile to enable job matching.',
        { type: 'missing_skills' },
        userId
      );
      messages.push(missingSkillsMessage);
    } else {
      console.log('[API] 📝 Creating match_analysis message');
      
      // Transform improvedSkills to required format: Array<{original: string, improved: string}>
      // Handles multiple formats for compatibility:
      // - New format: {original, improved} (preferred)
      // - Legacy format: {skill, suggestion}
      // - Plain strings: use same text for both fields (like Flutter)
      const improvedSkills = (matchAnalysis.improvedSkills || []).map(item => {
        // Handle string items (same as Flutter - use string for both fields)
        if (typeof item === 'string') {
          const text = item.trim();
          return { original: text, improved: text };
        }
        // Handle object items - prefer {original, improved} format
        return {
          original: item.original || item.skill || '',
          improved: item.improved || item.suggestion || ''
        };
      }).filter(item => item.original && item.improved); // Filter out empty items
      
      const matchAnalysisMessage = await createChatMessage(
        threadId,
        'assistant',
        'Match analysis complete',
        {
          type: 'match_analysis',
          matchPercentage: matchAnalysis.matchPercentage || 0,
          matchingSkills: matchAnalysis.matchingSkills || [],
          suggestedSkills: matchAnalysis.suggestedSkills || [],
          improvedSkills: improvedSkills,
          projectedMatchPercentage: matchAnalysis.projectedMatchPercentage || 0,
          reasoning: matchAnalysis.reasoning || '',
          userSkills: userSkills || [],
          jobSkills: analysisResult.jobSkills || [],
          jobDescription: jobInfo.description || jobDescription,
          credits_used: creditsUsed
        },
        userId
      );
      messages.push(matchAnalysisMessage);
      
      // 5. Network Intro Message (after match_analysis)
      const companyInfo = analysisResult.jobData?.companyInfo || {};
      if (companyInfo.name || jobInfo.company) {
        console.log('[API] 📝 Creating network_intro message');
        const networkIntroMessage = await createChatMessage(
          threadId,
          'assistant',
          'Here are some networking tips for this company:',
          {
            type: 'network_intro',
            companyName: companyInfo.name || jobInfo.company || '',
            companyDescription: companyInfo.description || '',
            companyLinkedInUrl: companyInfo.linkedInUrl || '',
            companyIndustry: companyInfo.industry || '',
            companySize: companyInfo.companySize || '',
            companyWebsiteUrl: companyInfo.websiteUrl || '',
            credits_used: 0
          },
          userId
        );
        messages.push(networkIntroMessage);
      }
    }
    
    console.log('[API] ✅ All job analysis messages created successfully:', messages.length, 'messages');
    return messages;
  } catch (error) {
    console.error('[API] ❌ Error creating job analysis messages:', error);
    throw error;
  }
}

/**
 * Save CV to database
 * @param {Object} cvData - Tailored CV data
 * @param {string} userId - User ID
 * @param {string} threadId - Chat thread ID
 * @param {string} jobUrl - Job URL
 * @param {string} jobTitle - Job title
 * @param {string} companyName - Company name
 * @param {Object} tailoredReport - Full tailored CV report
 * @returns {Promise<Object>} Saved CV record
 */
export async function saveCVToDatabase(cvData, userId, threadId, jobUrl, jobTitle, companyName, tailoredReport = null) {
  console.log('[API] 💾 Saving CV to database:', { userId, threadId, jobUrl });
  const client = await getSupabaseClient();

  try {
    // Build a Flutter-compatible tailored_report schema.
    // Flutter expects: { matchBefore, matchAfter, changes, patch: { summary, skills, highlights, focusSummary, experienceDescriptionsByIndex } }
    const buildFlutterTailoredReportFromCvData = (rawCvData, overrides = {}) => {
      const safe = rawCvData || {};

      const toNum = (v) => (typeof v === 'number' ? v : (typeof v === 'string' ? parseInt(v, 10) : 0)) || 0;
      const toStr = (v) => String(v ?? '').trim();

      const skills = (safe.skills || [])
        .map((s) => toStr(s))
        .filter((s) => s.length > 0);

      const highlights = (safe.highlights || [])
        .map((h) => {
          if (typeof h === 'string') return h.trim();
          if (h && typeof h === 'object') return toStr(h.text || h.description || '');
          return toStr(h);
        })
        .filter((h) => h.length > 0);

      const changes = (safe.changes || [])
        .map((c) => toStr(c))
        .filter((c) => c.length > 0);

      const experienceDescriptionsByIndex = {};
      (safe.experiences || []).forEach((exp) => {
        if (!exp) return;
        const idx =
          typeof exp.index === 'number'
            ? exp.index
            : (typeof exp.index === 'string' ? parseInt(exp.index, 10) : null);
        const desc = toStr(exp.description);
        if (idx === null || Number.isNaN(idx)) return;
        if (desc.length === 0) return;
        experienceDescriptionsByIndex[String(idx)] = desc;
      });

      const matchBefore = overrides.matchBefore ?? safe.matchBefore;
      const matchAfter = overrides.matchAfter ?? safe.matchAfter;
      const focusSummary =
        overrides.focusSummary ??
        safe.focusSummary ??
        safe.focus_summary ??
        null;

      return {
        matchBefore: toNum(matchBefore),
        matchAfter: toNum(matchAfter),
        changes: overrides.changes ?? changes,
        patch: {
          summary: toStr(safe.summary),
          skills,
          highlights,
          focusSummary: focusSummary ? toStr(focusSummary) : null,
          experienceDescriptionsByIndex
        }
      };
    };

    let tailoredReportToStore = tailoredReport;
    if (tailoredReportToStore && typeof tailoredReportToStore === 'object') {
      // Convert legacy schema (stored as { tailoredCvData: ... }) to Flutter schema.
      if (!tailoredReportToStore.patch && tailoredReportToStore.tailoredCvData) {
        tailoredReportToStore = buildFlutterTailoredReportFromCvData(
          tailoredReportToStore.tailoredCvData,
          {
            matchBefore: tailoredReportToStore.matchBefore,
            matchAfter: tailoredReportToStore.matchAfter,
            changes: tailoredReportToStore.changes
          }
        );
      } else if (!tailoredReportToStore.patch) {
        tailoredReportToStore = buildFlutterTailoredReportFromCvData(cvData);
      }
    } else {
      tailoredReportToStore = buildFlutterTailoredReportFromCvData(cvData);
    }

    // Build CV title
    const cvTitle = companyName && jobTitle ? `${companyName} — ${jobTitle}` : (jobTitle || 'Tailored CV');

    // Build CV content text (simplified - can be enhanced)
    let cvContent = '';
    if (cvData.summary) {
      cvContent += `Summary:\n${cvData.summary}\n\n`;
    }
    if (cvData.skills && cvData.skills.length > 0) {
      cvContent += `Skills:\n${cvData.skills.join(', ')}\n\n`;
    }
    if (cvData.highlights && cvData.highlights.length > 0) {
      cvContent += `Highlights:\n`;
      cvData.highlights.forEach(highlight => {
        const text =
          typeof highlight === 'string'
            ? highlight
            : (highlight && typeof highlight === 'object'
                ? (highlight.text || highlight.description || JSON.stringify(highlight))
                : String(highlight || ''));
        if (String(text).trim().length > 0) {
          cvContent += `- ${text}\n`;
        }
      });
      cvContent += '\n';
    }

    // Include full sections so consumers (including the extension) can display the updated descriptions.
    // This mirrors Flutter behavior where the tailored CVData contains updated work experience descriptions.
    if (Array.isArray(cvData.workExperiences) && cvData.workExperiences.length > 0) {
      cvContent += 'Work Experiences:\n';
      cvData.workExperiences.forEach((exp) => {
        const position = (exp?.position ?? '').toString().trim();
        const company = (exp?.company ?? '').toString().trim();
        const startDate = (exp?.startDate ?? '').toString().trim();
        const endDate = (exp?.endDate ?? '').toString().trim();
        const desc = (exp?.description ?? '').toString().trim();
        const header = [position, company].filter(Boolean).join(' at ') || 'Experience';
        const dates = [startDate, endDate].filter(Boolean).join(' - ');
        cvContent += `- ${header}${dates ? ` (${dates})` : ''}\n`;
        if (desc) cvContent += `  ${desc}\n`;
      });
      cvContent += '\n';
    }

    if (Array.isArray(cvData.projects) && cvData.projects.length > 0) {
      cvContent += 'Projects:\n';
      cvData.projects.forEach((p) => {
        const name = (p?.name ?? '').toString().trim() || 'Project';
        const desc = (p?.description ?? '').toString().trim();
        const techs = Array.isArray(p?.technologies) ? p.technologies.filter(Boolean).join(', ') : '';
        cvContent += `- ${name}\n`;
        if (desc) cvContent += `  ${desc}\n`;
        if (techs) cvContent += `  Technologies: ${techs}\n`;
      });
      cvContent += '\n';
    }

    const cvRecord = {
      user_id: userId,
      title: cvTitle,
      content: cvContent,
      job_url: jobUrl || '',
      thread_id: threadId,
      tailored_report: tailoredReportToStore
    };

    console.log('[API] 📤 Database insert data (CV):', {
      user_id: cvRecord.user_id,
      title: cvRecord.title,
      job_url: cvRecord.job_url,
      thread_id: cvRecord.thread_id,
      contentLength: cvRecord.content.length
    });

    const data = await client
      .from('cvs')
      .insert(cvRecord)
      .select()
      .single();

    if (!data) {
      throw new Error('Failed to save CV: no data returned');
    }

    console.log('[API] ✅ CV saved to database successfully:', data.id);
    return data;
  } catch (error) {
    console.error('[API] ❌ Database error (saveCVToDatabase):', error);
    throw error;
  }
}

/**
 * Create CV, Cover Letter, and Interview QA messages in correct order
 * Messages are created sequentially to ensure proper display order
 * @param {string} threadId - Chat thread ID
 * @param {Object} coverLetterData - Cover letter data
 * @param {Object} cvData - CV data
 * @param {Array} interviewQAData - Interview QA data (array of batches)
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of created messages
 */
export async function createCVCoverLetterInterviewQAMessages(threadId, coverLetterData, cvData, interviewQAData, userId) {
  console.log('[API] 📨 Creating CV/Cover Letter/Interview QA messages for thread:', threadId);
  const messages = [];

  if (!userId) {
    throw new Error('userId is required for creating messages');
  }

  try {
    // Order: cover_letter → cv → interview_qa
    // Add small delays between messages to ensure sequential display

    // 1. Cover Letter Message (if available)
    if (coverLetterData && coverLetterData.content) {
      console.log('[API] 📝 Creating cover_letter message');
      const coverLetterMessage = await createChatMessage(
        threadId,
        'assistant',
        "I've prepared a draft cover letter for you:",
        {
          type: 'cover_letter',
          content: coverLetterData.content,
          instructions: coverLetterData.instructions || null,
          credits_used: coverLetterData.creditsUsed ?? 0
        },
        userId
      );
      messages.push(coverLetterMessage);
      
      // Small delay to ensure sequential display
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 2. CV Message (if available)
    if (cvData) {
      console.log('[API] 📝 Creating cv message');
      console.log('[API] 📝 Received cvData:', {
        hasSummary: !!cvData.summary,
        summaryLength: cvData.summary?.length || 0,
        summaryPreview: cvData.summary?.substring(0, 100) || 'EMPTY',
        hasFocusSummary: !!cvData.focus_summary,
        focusSummary: cvData.focus_summary,
        skillsCount: cvData.skills?.length || 0,
        skills: cvData.skills || [],
        highlightsCount: cvData.highlights?.length || 0,
        highlights: cvData.highlights || [],
        experiencesCount: cvData.experiences?.length || 0,
        experiences: cvData.experiences || []
      });
      console.log('[API] 📝 Full cvData JSON:', JSON.stringify(cvData, null, 2));
      
      // Ensure experiences is in correct format (array of objects with index and description)
      // Flatten to simple objects to avoid JSON parsing issues in Flutter
      const experiences = (cvData.experiences || []).map(exp => {
        // Ensure index is a number
        const index = typeof exp.index === 'number' ? exp.index : (typeof exp.index === 'string' ? parseInt(exp.index, 10) || 0 : 0);
        // Ensure description is a string
        const description = String(exp.description || '');
        return {
          index: index,
          description: description
        };
      }).filter(exp => exp.description.trim().length > 0); // Remove empty descriptions
      
      console.log('[API] 📝 Processed experiences:', {
        count: experiences.length,
        experiences: experiences
      });
      
      // Ensure highlights are flat strings (Flutter expects List<String>)
      const flatHighlights = (cvData.highlights || []).map(h => {
        if (typeof h === 'string') return h;
        if (typeof h === 'object' && h !== null) {
          return h.text || h.description || JSON.stringify(h);
        }
        return String(h || '');
      }).filter(h => h.trim().length > 0);
      
      // Ensure skills are strings
      const flatSkills = (cvData.skills || []).map(s => String(s || '')).filter(s => s.trim().length > 0);
      
      // Ensure changes are strings
      const flatChanges = (cvData.changes || []).map(c => String(c || '')).filter(c => c.trim().length > 0);

      // Preserve full sections for rendering (Flutter-style CVData + patch coexist).
      const fullWorkExperiences = Array.isArray(cvData.workExperiences) ? cvData.workExperiences : [];
      const fullProjects = Array.isArray(cvData.projects) ? cvData.projects : [];
      
      const cvMetadata = {
        type: 'cv',
        summary: String(cvData.summary || ''),
        focus_summary: cvData.focus_summary ? String(cvData.focus_summary) : null,
        matchBefore: typeof cvData.matchBefore === 'number' ? cvData.matchBefore : (typeof cvData.matchBefore === 'string' ? parseInt(cvData.matchBefore, 10) || 0 : 0),
        matchAfter: typeof cvData.matchAfter === 'number' ? cvData.matchAfter : (typeof cvData.matchAfter === 'string' ? parseInt(cvData.matchAfter, 10) || 0 : 0),
        highlights: flatHighlights, // Flat strings for Flutter compatibility
        skills: flatSkills, // Ensure all are strings
        experiences: experiences, // Simple objects with index and description
        workExperiences: fullWorkExperiences,
        projects: fullProjects,
        changes: flatChanges, // Flat strings
        isGenerating: false,
        credits_used: cvData.creditsUsed ?? 0
      };
      
      console.log('[API] 📝 CV metadata to save:', {
        type: cvMetadata.type,
        hasSummary: !!cvMetadata.summary,
        summaryLength: cvMetadata.summary.length,
        summaryPreview: cvMetadata.summary.substring(0, 100),
        hasFocusSummary: !!cvMetadata.focus_summary,
        skillsCount: cvMetadata.skills.length,
        highlightsCount: cvMetadata.highlights.length,
        experiencesCount: cvMetadata.experiences.length
      });
      console.log('[API] 📝 Full CV metadata JSON:', JSON.stringify(cvMetadata, null, 2));
      
      const cvMessage = await createChatMessage(
        threadId,
        'assistant',
        cvData.summary || 'I\'ve tailored your CV for this position:',
        cvMetadata,
        userId
      );
      
      console.log('[API] ✅ CV message created:', {
        messageId: cvMessage.id,
        hasMetadata: !!cvMessage.metadata,
        metadataType: cvMessage.metadata?.type,
        metadataSummaryLength: cvMessage.metadata?.summary?.length || 0
      });
      
      messages.push(cvMessage);
      
      // Small delay to ensure sequential display
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log('[API] ⚠️ cvData is null or undefined, skipping CV message creation');
    }

    // 3. Interview QA Messages (if available)
    if (interviewQAData && Array.isArray(interviewQAData) && interviewQAData.length > 0) {
      // Process each batch
      for (let i = 0; i < interviewQAData.length; i++) {
        const batch = interviewQAData[i];
        if (batch && batch.items && batch.items.length > 0) {
          console.log('[API] 📝 Creating interview_qa message (batch', batch.batchIndex || i + 1, ')');
          const interviewQAMessage = await createChatMessage(
            threadId,
            'assistant',
            `Here are ${batch.items.length} interview questions to help you prepare:`,
            {
              type: 'interview_qa',
              interviewQA: batch.items,
              batchIndex: batch.batchIndex || i + 1,
              credits_used: batch.creditsUsed ?? 0
            },
            userId
          );
          messages.push(interviewQAMessage);
          
          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    console.log('[API] ✅ All CV/Cover Letter/Interview QA messages created successfully:', messages.length, 'messages');
    return messages;
  } catch (error) {
    console.error('[API] ❌ Error creating CV/Cover Letter/Interview QA messages:', error);
    throw error;
  }
}
