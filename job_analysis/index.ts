import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};

// DeepSeek API Configuration
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// Apify API Configuration
const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');
const APIFY_LINKEDIN_SCRAPER_ID = 'WJjlvvSMhDGvqnpbe';

interface JobAnalysisRequest {
  jobInput: string; // URL or job description text
  userId: string;
  userSkills?: string[];
  userProfile?: {
    fullName?: string;
    email?: string;
    headline?: string;
    summary?: string;
    location?: string;
    linkedin?: string;
    phone?: string;
    website?: string;
  };
}

interface JobAnalysisResponse {
  success: boolean;
  error?: string;
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
}

// Simple URL detection
function isLinkedInUrl(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return trimmed.includes('linkedin.com/jobs/');
}

// Extract skills from text using DeepSeek
async function extractSkillsFromJobDescription(description: string): Promise<string[]> {
  console.log('[Edge Function] 🤖 Calling DeepSeek API to extract skills (description length:', description.length, 'chars)');
  if (!DEEPSEEK_API_KEY) {
    console.error('[Edge Function] ❌ DeepSeek API key not configured');
    throw new Error('DeepSeek API key not configured');
  }

  const systemPrompt = `You are a skill extraction expert. Extract all technical skills, soft skills, tools, and technologies mentioned in the job description. Return ONLY valid JSON.`;
  
  const userPrompt = `Extract all skills from this job description:\n\n${description}\n\nReturn JSON: { "skills": ["skill1", "skill2", ...] }`;

  console.log('[Edge Function] 📤 DeepSeek API request:', {
    endpoint: DEEPSEEK_ENDPOINT,
    model: DEEPSEEK_MODEL,
    descriptionLength: description.length
  });

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  console.log('[Edge Function] 📥 DeepSeek API response status:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Edge Function] ❌ DeepSeek API error:', errorText);
    throw new Error(`DeepSeek API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const parsed = JSON.parse(content);
  
  console.log('[Edge Function] ✅ Skills extracted:', { count: parsed.skills?.length || 0, skills: parsed.skills });
  return parsed.skills || [];
}

// Calculate skill match using DeepSeek
async function calculateSkillMatch(
  userSkills: string[],
  jobSkills: string[],
  jobDescription: string
): Promise<{
  matchPercentage: number;
  matchingSkills: string[];
  reasoning: string;
  suggestedSkills: string[];
  improvedSkills: Array<{ skill: string; suggestion: string }>;
  projectedMatchPercentage: number;
}> {
  console.log('[Edge Function] 🤖 Calling DeepSeek API to calculate skill match');
  if (!DEEPSEEK_API_KEY) {
    console.error('[Edge Function] ❌ DeepSeek API key not configured');
    throw new Error('DeepSeek API key not configured');
  }

  const systemPrompt = `You are a professional skill matching expert. Analyze how well a candidate's skills match job requirements. Consider:
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
4. Suggest missing skills to improve match
5. For top 3-5 missing skills, provide specific improvement suggestions
6. Estimate projected match if user acquires suggested skills

Return the analysis as JSON.`;

  console.log('[Edge Function] 📤 DeepSeek API request (skill match):', {
    endpoint: DEEPSEEK_ENDPOINT,
    model: DEEPSEEK_MODEL,
    userSkillsCount: userSkills.length,
    jobSkillsCount: jobSkills.length,
    descriptionLength: jobDescription.length
  });

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });

  console.log('[Edge Function] 📥 DeepSeek API response status (skill match):', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Edge Function] ❌ DeepSeek API error (skill match):', errorText);
    throw new Error(`DeepSeek API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const parsed = JSON.parse(content);

  const result = {
    matchPercentage: Math.max(0, Math.min(100, parsed.matchPercentage || 0)),
    matchingSkills: parsed.matchingSkills || [],
    reasoning: parsed.reasoning || '',
    suggestedSkills: parsed.suggestedSkills || [],
    improvedSkills: parsed.improvedSkills || [],
    projectedMatchPercentage: Math.max(0, Math.min(100, parsed.projectedMatchPercentage || 0)),
  };

  console.log('[Edge Function] ✅ Skill match calculated:', {
    matchPercentage: result.matchPercentage,
    matchingSkillsCount: result.matchingSkills.length,
    suggestedSkillsCount: result.suggestedSkills.length,
    improvedSkillsCount: result.improvedSkills.length,
    projectedMatchPercentage: result.projectedMatchPercentage
  });

  return result;
}

// Scrape LinkedIn job using Apify
async function scrapeLinkedInJob(jobUrl: string): Promise<any> {
  console.log('[Edge Function] 🕷️ Starting Apify scraping for:', jobUrl);
  if (!APIFY_API_KEY) {
    console.error('[Edge Function] ❌ Apify API key not configured');
    throw new Error('Apify API key not configured');
  }

  // Start Apify actor run
  const apifyStartUrl = `https://api.apify.com/v2/acts/${APIFY_LINKEDIN_SCRAPER_ID}/runs?token=${APIFY_API_KEY}`;
  const apifyRequest = {
    startUrls: [{ url: jobUrl }],
    maxItems: 1,
  };

  console.log('[Edge Function] 📤 Apify start run request:', {
    url: apifyStartUrl,
    requestBody: apifyRequest
  });

  const runResponse = await fetch(apifyStartUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(apifyRequest),
  });

  console.log('[Edge Function] 📥 Apify start run response status:', runResponse.status, runResponse.statusText);

  if (!runResponse.ok) {
    const errorText = await runResponse.text();
    console.error('[Edge Function] ❌ Apify API error:', errorText);
    throw new Error(`Apify API error: ${runResponse.statusText}`);
  }

  const runData = await runResponse.json();
  const runId = runData.data.id;
  console.log('[Edge Function] ✅ Apify run started, Run ID:', runId);

  // Poll for completion (max 60 seconds)
  let attempts = 0;
  const maxAttempts = 30;
  
  console.log('[Edge Function] ⏳ Polling for Apify run completion (max', maxAttempts, 'attempts)...');
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const statusUrl = `https://api.apify.com/v2/acts/${APIFY_LINKEDIN_SCRAPER_ID}/runs/${runId}?token=${APIFY_API_KEY}`;
    const statusResponse = await fetch(statusUrl);
    
    if (!statusResponse.ok) {
      console.error('[Edge Function] ❌ Failed to check Apify run status:', statusResponse.status);
      throw new Error('Failed to check Apify run status');
    }
    
    const statusData = await statusResponse.json();
    const status = statusData.data.status;
    
    console.log('[Edge Function] 📊 Apify run status (attempt', attempts + 1, '):', status);
    
    if (status === 'SUCCEEDED') {
      console.log('[Edge Function] ✅ Apify run succeeded, fetching results...');
      // Get results
      const resultsUrl = `https://api.apify.com/v2/acts/${APIFY_LINKEDIN_SCRAPER_ID}/runs/${runId}/dataset/items?token=${APIFY_API_KEY}`;
      const resultsResponse = await fetch(resultsUrl);
      
      if (!resultsResponse.ok) {
        console.error('[Edge Function] ❌ Failed to fetch Apify results:', resultsResponse.status);
        throw new Error('Failed to fetch Apify results');
      }
      
      const results = await resultsResponse.json();
      console.log('[Edge Function] ✅ Apify results fetched:', {
        resultsCount: results.length,
        hasFirstResult: !!results[0],
        firstResultKeys: results[0] ? Object.keys(results[0]) : []
      });
      return results[0] || null;
    } else if (status === 'FAILED' || status === 'ABORTED') {
      console.error('[Edge Function] ❌ Apify run', status.toLowerCase());
      throw new Error(`Apify run ${status.toLowerCase()}`);
    }
    
    attempts++;
  }
  
  console.error('[Edge Function] ❌ Apify scraping timeout after', maxAttempts, 'attempts');
  throw new Error('Apify scraping timeout');
}

// Parse job description text using DeepSeek
async function parseJobDescription(jobDescription: string): Promise<any> {
  console.log('[Edge Function] 🤖 Calling DeepSeek API to parse job description (length:', jobDescription.length, 'chars)');
  if (!DEEPSEEK_API_KEY) {
    console.error('[Edge Function] ❌ DeepSeek API key not configured');
    throw new Error('DeepSeek API key not configured');
  }

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

  console.log('[Edge Function] 📤 DeepSeek API request (parse job):', {
    endpoint: DEEPSEEK_ENDPOINT,
    model: DEEPSEEK_MODEL,
    descriptionLength: jobDescription.length
  });

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  console.log('[Edge Function] 📥 DeepSeek API response status (parse job):', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Edge Function] ❌ DeepSeek API error (parse job):', errorText);
    throw new Error(`DeepSeek API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const parsed = JSON.parse(content);
  
  console.log('[Edge Function] ✅ Job description parsed:', {
    hasTitle: !!parsed.title,
    hasCompany: !!parsed.company,
    hasLocation: !!parsed.location,
    skillsCount: parsed.skills?.length || 0
  });
  
  return parsed;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('[Edge Function] 🔄 CORS preflight request');
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    console.log('[Edge Function] 📥 Request received');
    // Parse request body
    const requestData: JobAnalysisRequest = await req.json();
    const { jobInput, userId, userSkills = [], userProfile } = requestData;

    console.log('[Edge Function] 📋 Request data:', {
      jobInputType: typeof jobInput,
      jobInputLength: typeof jobInput === 'string' ? jobInput.length : 0,
      jobInputPreview: typeof jobInput === 'string' && jobInput.length > 100 ? `${jobInput.substring(0, 100)}...` : jobInput,
      userId,
      userSkillsCount: userSkills.length,
      hasUserProfile: Object.keys(userProfile || {}).length > 0
    });

    if (!jobInput || !userId) {
      console.error('[Edge Function] ❌ Missing required fields:', { hasJobInput: !!jobInput, hasUserId: !!userId });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: jobInput, userId',
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const authHeader = req.headers.get('Authorization');
    console.log('[Edge Function] 🔐 Auth header present:', !!authHeader);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
      }
    );

    // Check if input is LinkedIn URL or text
    const isLinkedIn = isLinkedInUrl(jobInput);
    console.log('[Edge Function] 🔗 Input type detection:', { isLinkedIn, inputPreview: jobInput.substring(0, 50) });
    let jobData: any;
    let jobSkills: string[] = [];

    if (isLinkedIn) {
      // Scrape LinkedIn job
      console.log('[Edge Function] 🔍 Scraping LinkedIn job:', jobInput);
      const scrapedData = await scrapeLinkedInJob(jobInput);
      
      if (!scrapedData) {
        console.error('[Edge Function] ❌ Failed to scrape LinkedIn job - no data returned');
        throw new Error('Failed to scrape LinkedIn job');
      }

      console.log('[Edge Function] ✅ LinkedIn job scraped successfully:', {
        hasTitle: !!scrapedData.title,
        hasCompany: !!scrapedData.company,
        hasDescription: !!scrapedData.description,
        descriptionLength: scrapedData.description?.length || 0,
        skillsCount: scrapedData.skills?.length || 0
      });

      // Transform scraped data to our format
      jobData = {
        jobInfo: {
          title: scrapedData.title || '',
          company: scrapedData.company || '',
          description: scrapedData.description || '',
          location: scrapedData.location || '',
          experienceLevel: scrapedData.experienceLevel || '',
          employmentType: scrapedData.employmentType || '',
          jobFunctions: scrapedData.jobFunctions || [],
          industries: scrapedData.industries || [],
          skills: scrapedData.skills || [],
        },
        companyInfo: {
          name: scrapedData.company || '',
          description: scrapedData.companyDescription || '',
          industry: scrapedData.companyIndustry || '',
          companySize: scrapedData.companySize || '',
          websiteUrl: scrapedData.companyWebsite || '',
          linkedInUrl: scrapedData.companyLinkedIn || '',
        },
      };
      
      console.log('[Edge Function] 📊 Transformed job data:', {
        title: jobData.jobInfo.title,
        company: jobData.jobInfo.company,
        location: jobData.jobInfo.location,
        descriptionLength: jobData.jobInfo.description.length,
        skillsFromScraper: jobData.jobInfo.skills.length
      });
      
      // Extract skills from description if not provided
      if (!jobData.jobInfo.skills || jobData.jobInfo.skills.length === 0) {
        console.log('[Edge Function] 🔍 No skills from scraper, extracting from description...');
        jobSkills = await extractSkillsFromJobDescription(jobData.jobInfo.description);
        console.log('[Edge Function] ✅ Extracted skills from description:', { count: jobSkills.length, skills: jobSkills });
      } else {
        jobSkills = jobData.jobInfo.skills;
        console.log('[Edge Function] ✅ Using skills from scraper:', { count: jobSkills.length, skills: jobSkills });
      }
    } else {
      // Parse job description text
      console.log('[Edge Function] 📝 Parsing job description text (length:', jobInput.length, 'chars)');
      const parsedJob = await parseJobDescription(jobInput);
      
      console.log('[Edge Function] ✅ Job description parsed:', {
        hasTitle: !!parsedJob.title,
        hasCompany: !!parsedJob.company,
        hasLocation: !!parsedJob.location,
        skillsCount: parsedJob.skills?.length || 0
      });
      
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
      
      if (parsedJob.skills && parsedJob.skills.length > 0) {
        jobSkills = parsedJob.skills;
        console.log('[Edge Function] ✅ Using skills from parsed job:', { count: jobSkills.length });
      } else {
        console.log('[Edge Function] 🔍 No skills in parsed job, extracting from description...');
        jobSkills = await extractSkillsFromJobDescription(jobInput);
        console.log('[Edge Function] ✅ Extracted skills:', { count: jobSkills.length });
      }
    }

    // Calculate skill match
    console.log('[Edge Function] 🎯 Calculating skill match:', {
      userSkillsCount: userSkills.length,
      jobSkillsCount: jobSkills.length,
      descriptionLength: jobData.jobInfo.description.length
    });
    const matchAnalysis = await calculateSkillMatch(
      userSkills,
      jobSkills,
      jobData.jobInfo.description
    );

    console.log('[Edge Function] ✅ Skill match calculated:', {
      matchPercentage: matchAnalysis.matchPercentage,
      matchingSkillsCount: matchAnalysis.matchingSkills.length,
      suggestedSkillsCount: matchAnalysis.suggestedSkills.length,
      projectedMatchPercentage: matchAnalysis.projectedMatchPercentage
    });

    // Build response
    const response: JobAnalysisResponse = {
      success: true,
      data: {
        jobData,
        matchAnalysis,
        jobSkills,
        isLinkedInUrl: isLinkedIn,
      },
    };

    console.log('[Edge Function] ✅ Response built successfully, returning...');
    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Edge Function] ❌ Job analysis error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }
});