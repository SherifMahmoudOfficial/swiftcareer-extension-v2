/**
 * Background Service Worker
 * Handles API calls, authentication state, and message passing
 */

import { 
  callJobAnalysis, 
  checkJobExists, 
  saveJobToDatabase, 
  getUserProfile,
  createOrUpdateChatThread,
  createJobAnalysisMessages,
  saveCVToDatabase,
  createCVCoverLetterInterviewQAMessages,
  createPortfolioMessage
} from '../utils/api.js';
import { getCurrentUser, isAuthenticated, getAccessToken, getSupabaseClient } from '../utils/supabase.js';
import { generateCoverLetter, generateInterviewQA, generateTailoredCV } from '../utils/generators.js';
import { getCompleteCVData } from '../utils/cv_data.js';
import { calculateCostFromUsage, calculateGeminiCostFromUsage } from '../utils/cost_calculator.js';
import { deductCredits } from '../utils/credits_service.js';
import { deepSeekJsonObject } from '../utils/deepseek_client.js';
import { Storage } from '../utils/storage.js';
import { generatePortfolioHTML } from '../utils/portfolio_generator.js';
import { uploadPortfolioToStorage } from '../utils/portfolio_service.js';

// Log service worker startup
console.log('[Background] 🚀 Service Worker initialized successfully');
console.log('[Background] 📦 All modules imported successfully');

/**
 * Build a complete job description text from extracted DOM data
 * This will be sent to Edge Function as text input (not URL)
 * Prioritizes "About the job" section if available
 */
function buildJobDescriptionFromExtractedData(extractedData) {
  console.log('[Background] 🔨 Building job description from extracted DOM data');
  let description = '';

  if (extractedData.title) {
    description += `Job Title: ${extractedData.title}\n\n`;
  }

  if (extractedData.company) {
    description += `Company: ${extractedData.company}\n\n`;
  }

  if (extractedData.location) {
    description += `Location: ${extractedData.location}\n\n`;
  }

  if (extractedData.employmentType) {
    description += `Employment Type: ${extractedData.employmentType}\n\n`;
  }

  if (extractedData.experienceLevel) {
    description += `Experience Level: ${extractedData.experienceLevel}\n\n`;
  }

  // Prioritize "About the job" section if available (most comprehensive)
  if (extractedData.aboutTheJob && extractedData.aboutTheJob.trim().length > 50) {
    console.log('[Background] ✅ Using "About the job" section (length:', extractedData.aboutTheJob.length, 'chars)');
    description += `About the Job:\n${extractedData.aboutTheJob}`;
  } else if (extractedData.description && extractedData.description.trim().length > 0) {
    console.log('[Background] ⚠️ "About the job" not available, using description fallback (length:', extractedData.description.length, 'chars)');
    description += `Job Description:\n${extractedData.description}`;
  } else {
    console.log('[Background] ⚠️ No job description content available');
  }

  const result = description.trim();
  console.log('[Background] ✅ Built description (length:', result.length, 'chars)');
  return result;
}

// Log service worker startup
console.log('[Background] 🚀 Service Worker started');

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    handleMessage(request, sender, sendResponse);
    return true; // Keep channel open for async response
  } catch (error) {
    console.error('[Background] ❌ Error in message listener:', error);
    sendResponse({ success: false, error: error.message || 'Unknown error' });
    return true;
  }
});

async function handleMessage(request, sender, sendResponse) {
  console.log('[Background] 📥 Received message:', request);
  try {
    switch (request.action) {
      case 'checkAuth':
        console.log('[Background] 🔐 Checking authentication...');
        const authenticated = await isAuthenticated();
        const user = authenticated ? await getCurrentUser() : null;
        console.log('[Background] ✅ Auth check result:', { authenticated, userId: user?.id });
        sendResponse({ success: true, authenticated, user });
        break;

      case 'checkJobExists':
        console.log('[Background] 🔍 Checking if job exists:', { jobUrl: request.jobUrl, userId: request.userId });
        if (!request.userId || !request.jobUrl) {
          console.log('[Background] ❌ Missing userId or jobUrl');
          sendResponse({ success: false, error: 'Missing userId or jobUrl' });
          return;
        }
        const existingJob = await checkJobExists(request.jobUrl, request.userId);
        console.log('[Background] 📊 Job exists check result:', { exists: !!existingJob, job: existingJob });
        sendResponse({ success: true, exists: !!existingJob, job: existingJob });
        break;

      case 'analyzeJob':
        console.log('[Background] 🚀 Starting job analysis:', { jobUrl: request.jobUrl, userId: request.userId });
        if (!request.jobUrl || !request.userId) {
          console.log('[Background] ❌ Missing jobUrl or userId');
          sendResponse({ success: false, error: 'Missing jobUrl or userId' });
          return;
        }

        // Prefer real job text extracted from the DOM (Flutter-equivalent "job description"),
        // and only fall back to URL if DOM extraction is missing/empty.
        const domJobDescription = request.extractedJobData
          ? buildJobDescriptionFromExtractedData(request.extractedJobData)
          : '';
        const jobInputForAnalysis =
          domJobDescription && domJobDescription.trim().length > 0
            ? domJobDescription
            : request.jobUrl;

        // Get user profile and skills
        let userSkills = [];
        let userProfile = {};
        
        try {
          console.log('[Background] 👤 Fetching user profile for userId:', request.userId);
          const profile = await getUserProfile(request.userId);
          userSkills = profile.skills || [];
          userProfile = {
            fullName: profile.full_name,
            email: profile.email,
            headline: profile.headline,
            summary: profile.summary,
            location: profile.location,
            linkedin: profile.linkedin,
            phone: profile.phone,
            website: profile.website,
            skills: userSkills
          };
          console.log('[Background] ✅ User profile fetched:', {
            fullName: userProfile.fullName,
            skillsCount: userSkills.length,
            hasHeadline: !!userProfile.headline,
            hasSummary: !!userProfile.summary
          });
        } catch (error) {
          console.warn('[Background] ⚠️ Could not fetch user profile:', error);
        }

        let analysisResult;
        let savedJob;
        let chatThread;
        let chatMessages;
        let jobDescription;

        try {
          console.log('[Background] 🌐 Calling job analysis API with input:', {
            kind: jobInputForAnalysis === request.jobUrl ? 'url' : 'dom_text',
            length: jobInputForAnalysis.length
          });
          console.log('[Background] 📤 API Request data:', {
            jobUrl: request.jobUrl,
            userId: request.userId,
            userSkillsCount: userSkills.length,
            hasUserProfile: Object.keys(userProfile).length > 0
          });
          
          analysisResult = await callJobAnalysis(
            jobInputForAnalysis,
            request.userId,
            userSkills,
            userProfile
          );

          console.log('[Background] ✅ Job analysis API response received:', {
            hasJobData: !!analysisResult.jobData,
            hasMatchAnalysis: !!analysisResult.matchAnalysis,
            jobSkillsCount: analysisResult.jobSkills?.length || 0,
            isLinkedInUrl: analysisResult.isLinkedInUrl,
            creditsUsed: analysisResult.creditsUsed
          });

          // Notify popup to refresh credits if they were deducted
          if (analysisResult.creditsUsed && analysisResult.creditsUsed > 0) {
            try {
              chrome.runtime.sendMessage({ action: 'creditsUpdated' }).catch(() => {
                // Popup might not be open, ignore error
              });
            } catch (e) {
              // Ignore if no listeners
            }
          }

          // Build job description for user message
          const jobInfo = analysisResult.jobData?.jobInfo || {};
          jobDescription = request.extractedJobData 
            ? buildJobDescriptionFromExtractedData(request.extractedJobData)
            : (jobInfo.description || request.jobUrl);

          // 1. Create or update chat thread
          console.log('[Background] 💬 Creating/updating chat thread...');
          try {
            chatThread = await createOrUpdateChatThread(
              request.userId,
              request.jobUrl,
              jobInfo.title,
              jobInfo.company
            );
            console.log('[Background] ✅ Chat thread created/updated:', chatThread.id);

            // 2. Create all chat messages
            console.log('[Background] 📨 Creating chat messages...');
            chatMessages = await createJobAnalysisMessages(
              chatThread.id,
              jobDescription,
              analysisResult,
              userSkills,
              request.jobUrl,
              request.userId
            );
            console.log('[Background] ✅ Chat messages created:', chatMessages.length, 'messages');
          } catch (chatError) {
            console.error('[Background] ⚠️ Error creating chat thread/messages:', chatError);
            // Continue even if chat creation fails - we still want to save the job
          }

          // 3. Save to database
          console.log('[Background] 💾 Saving job to database...');
          savedJob = await saveJobToDatabase(
            { ...analysisResult, jobUrl: request.jobUrl },
            request.userId
          );
          console.log('[Background] ✅ Job saved to database:', savedJob);
        } catch (error) {
          console.error('[Background] ❌ Apify/API call failed:', error);
          // If Apify fails and we have extracted DOM data, use it as fallback
          if (request.extractedJobData && Object.keys(request.extractedJobData).length > 0) {
            console.log('[Background] 🔄 Apify failed, using DOM extracted data as fallback');
            console.log('[Background] 📄 Extracted DOM data:', {
              title: request.extractedJobData.title,
              company: request.extractedJobData.company,
              location: request.extractedJobData.location,
              descriptionLength: request.extractedJobData.description?.length || 0,
              aboutTheJobLength: request.extractedJobData.aboutTheJob?.length || 0,
              employmentType: request.extractedJobData.employmentType,
              experienceLevel: request.extractedJobData.experienceLevel
            });
            
            // Build job description from extracted DOM data
            jobDescription = buildJobDescriptionFromExtractedData(request.extractedJobData);
            console.log('[Background] 📝 Built job description from DOM (length:', jobDescription.length, 'chars)');
            
            if (jobDescription.trim().length > 0) {
              // Send as text description instead of URL
              // Edge Function will treat it as text and use parseJobDescription
              console.log('[Background] 🌐 Calling job analysis API with text description...');
              analysisResult = await callJobAnalysis(
                jobDescription, // Send text instead of URL
                request.userId,
                userSkills,
                userProfile
              );

              console.log('[Background] ✅ Job analysis API response (fallback):', {
                hasJobData: !!analysisResult.jobData,
                hasMatchAnalysis: !!analysisResult.matchAnalysis
              });

              // Build job description for user message (use the one we built)
              const jobInfo = analysisResult.jobData?.jobInfo || {};

              // 1. Create or update chat thread
              console.log('[Background] 💬 Creating/updating chat thread (fallback)...');
              try {
                chatThread = await createOrUpdateChatThread(
                  request.userId,
                  request.jobUrl,
                  jobInfo.title,
                  jobInfo.company
                );
                console.log('[Background] ✅ Chat thread created/updated (fallback):', chatThread.id);

                // 2. Create all chat messages
                console.log('[Background] 📨 Creating chat messages (fallback)...');
                chatMessages = await createJobAnalysisMessages(
                  chatThread.id,
                  jobDescription,
                  analysisResult,
                  userSkills,
                  request.jobUrl,
                  request.userId
                );
                console.log('[Background] ✅ Chat messages created (fallback):', chatMessages.length, 'messages');
              } catch (chatError) {
                console.error('[Background] ⚠️ Error creating chat thread/messages (fallback):', chatError);
                // Continue even if chat creation fails - we still want to save the job
              }

              // 3. Save to database with original jobUrl
              console.log('[Background] 💾 Saving job to database (fallback)...');
              savedJob = await saveJobToDatabase(
                { ...analysisResult, jobUrl: request.jobUrl },
                request.userId
              );
              console.log('[Background] ✅ Job saved to database (fallback):', savedJob);
            } else {
              console.error('[Background] ❌ Job description from DOM is empty');
              throw new Error('Failed to extract job data from DOM and Apify failed');
            }
          } else {
            console.error('[Background] ❌ No fallback data available');
            // No fallback data available, re-throw the error
            throw error;
          }
        }

        console.log('[Background] ✅ Job analysis completed successfully');

        // Generate CV, Cover Letter, and Interview QA if enabled
        let generatedContent = null;
        let generationErrors = [];
        try {
          generatedContent = await generateContentAfterJobAnalysis(
            request.userId,
            chatThread,
            analysisResult,
            userProfile,
            userSkills
          );
          console.log('[Background] ✅ Content generation completed:', {
            hasCoverLetter: !!generatedContent?.coverLetter,
            hasCV: !!generatedContent?.cv,
            hasInterviewQA: !!generatedContent?.interviewQA,
            messagesCount: generatedContent?.messages?.length || 0
          });
        } catch (genError) {
          console.error('[Background] ⚠️ Error generating content (non-fatal):', genError);
          generationErrors.push(genError.message || 'Unknown error');
          // Don't fail the whole request if content generation fails
          // Log error but continue
          console.warn('[Background] ⚠️ Continuing despite content generation errors');
        }

        sendResponse({
          success: true,
          analysis: analysisResult,
          savedJob,
          chatThread,
          chatMessages,
          generatedContent
        });
        break;

      case 'getUser':
        console.log('[Background] 👤 Getting current user...');
        const currentUser = await getCurrentUser();
        console.log('[Background] ✅ Current user:', { id: currentUser?.id, email: currentUser?.email });
        sendResponse({ success: true, user: currentUser });
        break;

      default:
        console.log('[Background] ❌ Unknown action:', request.action);
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('[Background] ❌ Error handling message:', error);
    sendResponse({
      success: false,
      error: error.message || 'An error occurred'
    });
  }
}

/**
 * Get user message preferences
 */
async function getUserMessagePreferences(userId) {
  console.log('[Background] 📋 Fetching user message preferences:', userId);
  try {
    const client = await getSupabaseClient();
    
    // Our custom supabase client returns data directly, not { data, error }
    const data = await client
      .from('users')
      .select('message_preferences, skills')
      .eq('id', userId)
      .single();

    if (!data) {
      console.warn('[Background] ⚠️ No user data found, using defaults');
      // Return defaults if no data
      return {
        preferences: { cv: true, cover_letter: true, interview_qa: true, portfolio: true },
        hasSkills: false
      };
    }

    // Default preferences if not set
    const defaultPreferences = {
      cv: true,
      cover_letter: true,
      interview_qa: true,
      portfolio: true
    };

    const preferencesRaw =
      (data.message_preferences && typeof data.message_preferences === 'object')
        ? data.message_preferences
        : {};
    // Merge defaults so missing keys don't become undefined
    const preferences = { ...defaultPreferences, ...preferencesRaw };
    const hasSkills = data.skills && Array.isArray(data.skills) && data.skills.length > 0;

    console.log('[Background] ✅ User preferences:', {
      preferences,
      hasSkills,
      skillsCount: data.skills?.length || 0,
      hasMessagePreferences: !!data.message_preferences
    });

    return { preferences, hasSkills };
  } catch (error) {
    console.error('[Background] ❌ Error fetching user preferences:', error);
    console.error('[Background] ❌ Error details:', {
      message: error.message,
      stack: error.stack
    });
    // Return defaults on error
    return {
      preferences: { cv: true, cover_letter: true, interview_qa: true, portfolio: true },
      hasSkills: false
    };
  }
}

/**
 * Calculate match percentage between user skills and job skills
 * @param {Array<string>} userSkills - User's skills
 * @param {Array<string>} jobSkills - Job required skills
 * @returns {number} Match percentage (0-100)
 */
function calculateMatchPercentage(userSkills, jobSkills) {
  if (!jobSkills || jobSkills.length === 0) return 0;
  if (!userSkills || userSkills.length === 0) return 0;
  
  const normalizedJob = jobSkills.map(s => s.toLowerCase().trim()).filter(s => s.length > 0);
  const normalizedUser = userSkills.map(s => s.toLowerCase().trim()).filter(s => s.length > 0);
  
  if (normalizedJob.length === 0) return 0;
  
  // Count matching skills (case-insensitive, partial match allowed)
  const matching = normalizedUser.filter(userSkill => 
    normalizedJob.some(jobSkill => 
      jobSkill.includes(userSkill) || userSkill.includes(jobSkill) || jobSkill === userSkill
    )
  );
  
  const percentage = Math.round((matching.length / normalizedJob.length) * 100);
  return Math.min(100, Math.max(0, percentage)); // Clamp between 0-100
}

/**
 * Flutter-equivalent strict skill match percentage (set intersection only).
 * Used as fallback when AI matching fails.
 */
function calculateStrictSkillMatchPercentage(userSkills, jobSkills) {
  if (!Array.isArray(jobSkills) || jobSkills.length === 0) return 0;
  if (!Array.isArray(userSkills) || userSkills.length === 0) return 0;

  const normalize = (s) => String(s || '').trim().toLowerCase();
  const normalizedUser = new Set(userSkills.map(normalize).filter((s) => s.length > 0));
  const normalizedJob = new Set(jobSkills.map(normalize).filter((s) => s.length > 0));
  if (normalizedJob.size === 0) return 0;

  let matches = 0;
  for (const js of normalizedJob) {
    if (normalizedUser.has(js)) matches += 1;
  }
  return Math.max(0, Math.min(100, Math.round((matches / normalizedJob.size) * 100)));
}

/**
 * Flutter-equivalent simple keyword overlap fallback.
 */
function simpleKeywordOverlap(text1, text2) {
  const t1 = String(text1 || '').trim();
  const t2 = String(text2 || '').trim();
  if (t1.length === 0 || t2.length === 0) return 0;

  const words1 = new Set(
    t1
      .toLowerCase()
      .split(/[^\w]+/)
      .filter((w) => w.length > 3)
  );
  const words2 = new Set(
    t2
      .toLowerCase()
      .split(/[^\w]+/)
      .filter((w) => w.length > 3)
  );
  if (words2.size === 0) return 0;

  let overlap = 0;
  for (const w of words1) {
    if (words2.has(w)) overlap += 1;
  }
  return Math.max(0, Math.min(100, Math.round((overlap / words2.size) * 100)));
}

/**
 * Flutter-equivalent semantic similarity (0-100) using DeepSeek, with keyword-overlap fallback.
 */
async function calculateTextSimilarity({ text1, text2, context }) {
  try {
    const systemPrompt =
      'You are a text similarity analyzer. Analyze how well two texts match and return a similarity score from 0-100. Output only valid JSON.';
    const userPrompt =
      `Text 1: ${text1}\n\n` +
      `Text 2: ${text2}\n\n` +
      `Context: ${context}\n\n` +
      'Calculate semantic similarity (0-100) considering:\n' +
      '- Keyword overlap\n' +
      '- Semantic meaning\n' +
      '- Relevance\n\n' +
      'Return JSON: {"similarity": number}';

    const result = await deepSeekJsonObject({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      label: 'Text Similarity'
    });
    const similarity = Math.round(Number(result?.parsed?.similarity ?? 0));
    return Math.max(0, Math.min(100, similarity));
  } catch (e) {
    return simpleKeywordOverlap(text1, text2);
  }
}

/**
 * Flutter-equivalent AI skill match percentage (0-100) using DeepSeek, with strict-set fallback.
 */
async function calculateSkillMatchPercentageAI({ userSkills, jobSkills, jobDescription }) {
  if (!Array.isArray(jobSkills) || jobSkills.length === 0) return 0;
  if (!Array.isArray(userSkills) || userSkills.length === 0) return 0;

  try {
    const systemPrompt =
      'You are a career matching expert. Compare user skills with job requirements intelligently, understanding:\n' +
      '- Synonyms (e.g., "React" matches "React.js", "ReactJS")\n' +
      '- Related skills (e.g., "JavaScript" partially matches "TypeScript")\n' +
      '- Skill hierarchies (e.g., "Frontend Development" includes "React", "Vue")\n' +
      '- Context from job description\n\n' +
      'Return JSON: {\n' +
      '  "matchPercentage": number (0-100),\n' +
      '  "matchingSkills": ["skill1", "skill2", ...],\n' +
      '  "reasoning": "brief explanation"\n' +
      '}';

    const descContext =
      jobDescription && String(jobDescription).trim().length > 0
        ? `\n\nJob Description Context:\n${jobDescription}`
        : '';

    const userPrompt =
      `User Skills: ${userSkills.join(', ')}\n\n` +
      `Job Required Skills: ${jobSkills.join(', ')}${descContext}\n\n` +
      'Analyze the match and return JSON with matchPercentage, matchingSkills array, and reasoning.';

    const result = await deepSeekJsonObject({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      label: 'Skill Match (Composite)'
    });
    const pct = Math.round(Number(result?.parsed?.matchPercentage ?? 0));
    return Math.max(0, Math.min(100, pct));
  } catch (e) {
    return calculateStrictSkillMatchPercentage(userSkills, jobSkills);
  }
}

/**
 * Flutter-equivalent composite match:
 * Skills (40%) + Summary similarity (30%) + Experiences similarity (30%)
 */
async function calculateCompositeMatch({ cvData, jobSkills, jobDescription }) {
  const safeCv = cvData || {};
  const userSkills = Array.isArray(safeCv.user?.skills) ? safeCv.user.skills : [];
  const summary = String(safeCv.user?.summary ?? '');
  const experiencesText = Array.isArray(safeCv.workExperiences)
    ? safeCv.workExperiences
        .map((e) => String(e?.description ?? ''))
        .filter((d) => d.trim().length > 0)
        .join(' ')
    : '';

  const jd = String(jobDescription ?? '');
  const js = Array.isArray(jobSkills) ? jobSkills : [];

  const skillsScore = await calculateSkillMatchPercentageAI({
    userSkills,
    jobSkills: js,
    jobDescription: jd
  });

  let summaryScore = 0;
  if (summary.trim().length > 0 && jd.trim().length > 0) {
    summaryScore = await calculateTextSimilarity({
      text1: summary,
      text2: jd,
      context: 'CV summary vs job description'
    });
  }

  let experiencesScore = 0;
  if (experiencesText.trim().length > 0 && jd.trim().length > 0) {
    experiencesScore = await calculateTextSimilarity({
      text1: experiencesText,
      text2: jd,
      context: 'CV experiences vs job description'
    });
  }

  const composite = (skillsScore * 0.4) + (summaryScore * 0.3) + (experiencesScore * 0.3);
  return Math.max(0, Math.min(100, Math.round(composite)));
}

/**
 * Generate CV, Cover Letter, and Interview QA after job analysis
 */
async function generateContentAfterJobAnalysis(userId, chatThread, analysisResult, userProfile, userSkills) {
  console.log('[Background] 🚀 Starting content generation after job analysis');

  // Check user preferences
  const { preferences, hasSkills: userHasSkills } = await getUserMessagePreferences(userId);

  if (!userHasSkills) {
    console.log('[Background] ⚠️ User has no skills, skipping CV and Interview QA generation');
    // Still can generate cover letter
  }

  const jobInfo = analysisResult.jobData?.jobInfo || {};
  const jobData = {
    title: jobInfo.title || '',
    company: jobInfo.company || '',
    location: jobInfo.location || '',
    description: jobInfo.description || '',
    experienceLevel: jobInfo.experienceLevel || '',
    employmentType: jobInfo.employmentType || '',
    skills: analysisResult.jobSkills || []
  };

  const generatedContent = {
    coverLetter: null,
    cv: null,
    interviewQA: null,
    portfolio: null,
    messages: []
  };

  try {
    // Generate Cover Letter if enabled
    if (preferences.cover_letter) {
      try {
        console.log('[Background] 🔎 Validation (Cover Letter):', {
          profileHasName: !!(userProfile?.fullName),
          profileSkillsCount: Array.isArray(userProfile?.skills) ? userProfile.skills.length : 0,
          jobTitle: jobData.title,
          company: jobData.company,
          jobDescriptionLength: (jobData.description || '').length
        });
        console.log('[Background] 📝 Generating cover letter...');
        const coverLetterResult = await generateCoverLetter({
          profile: userProfile,
          jobTitle: jobData.title,
          company: jobData.company,
          jobDescription: jobData.description,
          jobUrl: null, // Can be added if needed
          instructions: null // Can be added if needed
        });

        if (coverLetterResult.content && coverLetterResult.content.trim().length > 0) {
          // Deduct credits for cover letter generation
          let coverLetterCredits = 0;
          try {
            const coverLetterCost = calculateCostFromUsage(coverLetterResult.usage, 'Cover Letter');
            coverLetterCredits = coverLetterCost.credits;
            if (coverLetterCredits > 0) {
              const deducted = await deductCredits({
                credits: coverLetterCredits,
                reason: 'Cover Letter',
                userId: userId,
                source: 'deepseek',
                costDollars: coverLetterCost.totalCost
              });
              if (deducted) {
                console.log('[Background] ✅ Credits deducted for cover letter:', coverLetterCredits);
                // Notify popup to refresh credits
                chrome.runtime.sendMessage({ action: 'creditsUpdated' }).catch(() => {});
              } else {
                console.error('[Background] ⚠️ Failed to deduct credits for cover letter');
              }
            }
          } catch (creditError) {
            console.error('[Background] ❌ Error deducting credits for cover letter:', creditError);
          }
          
          generatedContent.coverLetter = {
            content: coverLetterResult.content,
            instructions: null,
            creditsUsed: coverLetterCredits
          };
          console.log('[Background] ✅ Cover letter generated (length:', coverLetterResult.content.length, 'chars, credits:', coverLetterCredits, ')');
        } else {
          console.warn('[Background] ⚠️ Cover letter generation returned empty content');
        }
      } catch (error) {
        console.error('[Background] ❌ Error generating cover letter:', error);
        console.error('[Background] ❌ Error details:', {
          message: error.message,
          stack: error.stack
        });
        // Continue with other content - error already handled in generator
      }
    }

    // Generate CV if enabled and user has skills
    if (preferences.cv && userHasSkills) {
      try {
        console.log('[Background] 🔎 Validation (Tailored CV):', {
          jobTitle: jobData.title,
          company: jobData.company,
          jobSkillsCount: Array.isArray(jobData.skills) ? jobData.skills.length : 0,
          jobDescriptionLength: (jobData.description || '').length
        });
        console.log('[Background] 📄 Generating tailored CV...');
        
        // Get complete CV data
        const cvData = await getCompleteCVData(userId);
        console.log('[Background] 📋 CV data fetched:', {
          hasUser: !!cvData.user,
          userSummary: cvData.user?.summary?.substring(0, 100) || 'N/A',
          userSummaryLength: cvData.user?.summary?.length || 0,
          userSkillsCount: cvData.user?.skills?.length || 0,
          userSkills: cvData.user?.skills || [],
          workExperiencesCount: cvData.workExperiences?.length || 0,
          projectsCount: cvData.projects?.length || 0,
          educationsCount: cvData.educations?.length || 0
        });
        
        // Guardrail: Validate CV data arrays before proceeding
        console.log('[Background] 🔍 Guardrail: Validating CV data arrays...');
        console.log('[Background] 🔍 workExperiences:', {
          isArray: Array.isArray(cvData.workExperiences),
          count: cvData.workExperiences?.length || 0,
          firstItem: cvData.workExperiences?.[0] ? {
            company: cvData.workExperiences[0].company,
            position: cvData.workExperiences[0].position,
            hasDescription: !!cvData.workExperiences[0].description
          } : null
        });
        console.log('[Background] 🔍 projects:', {
          isArray: Array.isArray(cvData.projects),
          count: cvData.projects?.length || 0,
          firstItem: cvData.projects?.[0] ? {
            name: cvData.projects[0].name,
            hasDescription: !!cvData.projects[0].description
          } : null
        });
        
        // Validate CV data before proceeding
        if (!cvData.user) {
          console.error('[Background] ❌ CRITICAL: CV data has no user object!');
          throw new Error('CV data is missing user information');
        }
        if (!cvData.user.summary || cvData.user.summary.trim().length === 0) {
          console.warn('[Background] ⚠️ WARNING: CV data has empty summary');
        }
        if (!cvData.user.skills || cvData.user.skills.length === 0) {
          console.warn('[Background] ⚠️ WARNING: CV data has no skills');
        }
        if (!cvData.workExperiences || cvData.workExperiences.length === 0) {
          console.warn('[Background] ⚠️ WARNING: CV data has no work experiences - highlights/experiences may be empty');
        }
        
        // Generate tailored CV
        console.log('[Background] 📤 Calling generateTailoredCV with:', {
          cvDataUser: cvData.user?.fullName || 'N/A',
          cvDataSummaryLength: cvData.user?.summary?.length || 0,
          cvDataSkillsCount: cvData.user?.skills?.length || 0,
          jobTitle: jobData.title,
          jobCompany: jobData.company,
          jobSkillsCount: jobData.skills.length
        });
        
        const tailoredResult = await generateTailoredCV({
          cvData: cvData,
          jobData: jobData,
          jobSkills: jobData.skills,
          userInstructions: null,
          focusLabel: null
        });

        const tailoredPatch = tailoredResult.patch;
        
        // Deduct credits for tailored CV generation
        let cvCredits = 0;
        try {
          const cvCost = calculateCostFromUsage(tailoredResult.usage, 'Tailored CV');
          cvCredits = cvCost.credits;
          if (cvCredits > 0) {
            const deducted = await deductCredits({
              credits: cvCredits,
              reason: 'Tailored CV',
              userId: userId,
              source: 'deepseek',
              costDollars: cvCost.totalCost
            });
            if (deducted) {
              console.log('[Background] ✅ Credits deducted for tailored CV:', cvCredits);
              // Notify popup to refresh credits
              chrome.runtime.sendMessage({ action: 'creditsUpdated' }).catch(() => {});
            } else {
              console.error('[Background] ⚠️ Failed to deduct credits for tailored CV');
            }
          }
        } catch (creditError) {
          console.error('[Background] ❌ Error deducting credits for tailored CV:', creditError);
        }

        console.log('[Background] 📥 Received tailoredPatch from generateTailoredCV');
        console.log('[Background] 📥 tailoredPatch structure:', {
          hasSummary: !!tailoredPatch.summary,
          summaryLength: tailoredPatch.summary?.length || 0,
          summaryPreview: tailoredPatch.summary?.substring(0, 100) || 'N/A',
          hasFocusSummary: !!tailoredPatch.focus_summary,
          focusSummary: tailoredPatch.focus_summary,
          skillsCount: tailoredPatch.skills?.length || 0,
          skills: tailoredPatch.skills || [],
          highlightsCount: tailoredPatch.highlights?.length || 0,
          highlights: tailoredPatch.highlights || [],
          experiencesCount: tailoredPatch.experiences?.length || 0,
          experiences: tailoredPatch.experiences || [],
          creditsUsed: cvCredits
        });
        console.log('[Background] 📥 Full tailoredPatch JSON:', JSON.stringify(tailoredPatch, null, 2));

        // Validate tailoredPatch before building
        console.log('[Background] 🔍 Validating tailoredPatch before building cvDataWithReport...');
        console.log('[Background] 🔍 Original CV data:', {
          hasUserSummary: !!cvData.user?.summary,
          userSummaryLength: cvData.user?.summary?.length || 0,
          userSkillsCount: cvData.user?.skills?.length || 0,
          workExperiencesCount: cvData.workExperiences?.length || 0
        });

        // Build CV data structure with intelligent fallback
        // Priority: tailoredPatch > original cvData > safe defaults
        let finalSummary = '';
        if (tailoredPatch.summary && typeof tailoredPatch.summary === 'string' && tailoredPatch.summary.trim().length > 0) {
          finalSummary = tailoredPatch.summary.trim();
          console.log('[Background] ✅ Using tailoredPatch summary (length:', finalSummary.length, ')');
        } else if (cvData.user?.summary && cvData.user.summary.trim().length > 0) {
          finalSummary = cvData.user.summary.trim();
          console.log('[Background] ⚠️ tailoredPatch summary empty, using original summary (length:', finalSummary.length, ')');
        } else {
          finalSummary = 'Professional with relevant experience and skills.';
          console.log('[Background] ⚠️ No summary available, using default fallback');
        }

        let finalSkills = [];
        if (Array.isArray(tailoredPatch.skills) && tailoredPatch.skills.length > 0) {
          finalSkills = tailoredPatch.skills.filter(s => s && typeof s === 'string' && s.trim().length > 0);
          console.log('[Background] ✅ Using tailoredPatch skills (count:', finalSkills.length, ')');
        } else if (Array.isArray(cvData.user?.skills) && cvData.user.skills.length > 0) {
          finalSkills = [...cvData.user.skills];
          console.log('[Background] ⚠️ tailoredPatch skills empty, using original skills (count:', finalSkills.length, ')');
        } else {
          finalSkills = ['Professional Skills'];
          console.log('[Background] ⚠️ No skills available, using default fallback');
        }

        let finalHighlights = [];
        if (Array.isArray(tailoredPatch.highlights) && tailoredPatch.highlights.length > 0) {
          finalHighlights = tailoredPatch.highlights.filter(h => 
            h && typeof h === 'object' && 
            h.text && typeof h.text === 'string' && h.text.trim().length > 0
          );
          console.log('[Background] ✅ Using tailoredPatch highlights (count:', finalHighlights.length, ')');
        } else {
          // Create highlights from work experiences if available
          if (cvData.workExperiences && cvData.workExperiences.length > 0) {
            finalHighlights = cvData.workExperiences
              .slice(0, 5)
              .filter(exp => exp.description && exp.description.trim().length > 0)
              .map((exp, idx) => ({
                text: exp.description.substring(0, 150) + (exp.description.length > 150 ? '...' : ''),
                source: 'experience',
                index: idx
              }));
            console.log('[Background] ⚠️ tailoredPatch highlights empty, created from experiences (count:', finalHighlights.length, ')');
          }
        }
        
        // Convert highlights from List<Map> to List<String> for Flutter compatibility
        const flatHighlights = finalHighlights.map(h => {
          if (typeof h === 'object' && h !== null) {
            return h.text || h.description || JSON.stringify(h);
          }
          return String(h || '');
        }).filter(h => h.trim().length > 0);
        
        console.log('[Background] 🔄 Converted highlights to flat strings:', {
          originalCount: finalHighlights.length,
          flatCount: flatHighlights.length,
          sample: flatHighlights[0]?.substring(0, 50) || 'N/A'
        });

        let finalExperiences = [];
        if (Array.isArray(tailoredPatch.experiences) && tailoredPatch.experiences.length > 0) {
          finalExperiences = tailoredPatch.experiences.filter(exp => 
            exp && typeof exp === 'object' && 
            (typeof exp.index === 'number' || (typeof exp.index === 'string' && !Number.isNaN(parseInt(exp.index, 10)))) &&
            exp.description && typeof exp.description === 'string' && exp.description.trim().length > 0
          );
          console.log('[Background] ✅ Using tailoredPatch experiences (count:', finalExperiences.length, ')');
        } else if (cvData.workExperiences && cvData.workExperiences.length > 0) {
          finalExperiences = cvData.workExperiences.map((exp, idx) => ({
            index: idx,
            description: exp.description || `${exp.position || 'Position'} at ${exp.company || 'Company'}`
          }));
          console.log('[Background] ⚠️ tailoredPatch experiences empty, using original experiences (count:', finalExperiences.length, ')');
        }

        // Build a Flutter-compatible tailored_report schema.
        // Flutter expects: { matchBefore, matchAfter, changes, patch: { summary, skills, highlights, focusSummary, experienceDescriptionsByIndex } }
        const experienceDescriptionsByIndex = {};
        (finalExperiences || []).forEach((exp) => {
          if (!exp) return;
          const idx =
            typeof exp.index === 'number'
              ? exp.index
              : (typeof exp.index === 'string' ? parseInt(exp.index, 10) : null);
          const desc = (exp.description ?? '').toString();
          if (idx === null || Number.isNaN(idx)) return;
          if (desc.trim().length === 0) return;
          experienceDescriptionsByIndex[String(idx)] = desc;
        });

        // Flutter-equivalent application: merge enhanced descriptions back onto the full work experience objects.
        const tailoredWorkExperiences = (cvData.workExperiences || []).map((exp, idx) => {
          const enhancedDescription = experienceDescriptionsByIndex[String(idx)];
          if (enhancedDescription && enhancedDescription.trim().length > 0) {
            return { ...exp, description: enhancedDescription };
          }
          return exp;
        });

        // Calculate match scores (Flutter-equivalent composite match)
        const matchBefore = await calculateCompositeMatch({
          cvData: {
            user: {
              skills: Array.isArray(cvData.user?.skills) ? cvData.user.skills : [],
              summary: cvData.user?.summary ?? ''
            },
            workExperiences: Array.isArray(cvData.workExperiences) ? cvData.workExperiences : []
          },
          jobSkills: jobData.skills,
          jobDescription: jobData.description
        });

        const matchAfter = await calculateCompositeMatch({
          cvData: {
            user: {
              skills: Array.isArray(finalSkills) ? finalSkills : [],
              summary: finalSummary
            },
            workExperiences: tailoredWorkExperiences
          },
          jobSkills: jobData.skills,
          jobDescription: jobData.description
        });

        console.log('[Background] 📊 Calculated composite match scores:', {
          matchBefore,
          matchAfter,
          jobSkillsCount: Array.isArray(jobData.skills) ? jobData.skills.length : 0
        });
        
        const cvDataWithReport = {
          summary: finalSummary,
          focus_summary: tailoredPatch.focus_summary || null,
          skills: finalSkills,
          highlights: flatHighlights, // Use flat strings instead of objects
          experiences: finalExperiences,
          matchBefore: matchBefore,
          matchAfter: matchAfter,
          changes: [], // Can be populated if needed
          creditsUsed: cvCredits
        };

        const tailoredReportForFlutter = {
          matchBefore: matchBefore,
          matchAfter: matchAfter,
          changes: cvDataWithReport.changes || [],
          patch: {
            summary: cvDataWithReport.summary || '',
            skills: cvDataWithReport.skills || [],
            highlights: cvDataWithReport.highlights || [],
            focusSummary: cvDataWithReport.focus_summary || null,
            experienceDescriptionsByIndex
          }
        };

        // Final validation: ensure critical fields are never empty
        if (!cvDataWithReport.summary || cvDataWithReport.summary.trim().length === 0) {
          console.error('[Background] ❌ CRITICAL: Summary is still empty after all fallbacks!');
          cvDataWithReport.summary = 'Professional with relevant experience and skills.';
        }
        if (cvDataWithReport.skills.length === 0) {
          console.error('[Background] ❌ CRITICAL: Skills array is still empty after all fallbacks!');
          cvDataWithReport.skills = ['Professional Skills'];
        }
        
        // Guardrail: Validate highlights and experiences before storing
        if (cvDataWithReport.highlights.length === 0) {
          console.warn('[Background] ⚠️ WARNING: Highlights array is empty - this may cause empty CV display');
          console.warn('[Background] ⚠️ Original workExperiences count:', cvData.workExperiences?.length || 0);
        }
        if (cvDataWithReport.experiences.length === 0) {
          console.warn('[Background] ⚠️ WARNING: Experiences array is empty - this may cause empty CV display');
          console.warn('[Background] ⚠️ Original workExperiences count:', cvData.workExperiences?.length || 0);
        }

        console.log('[Background] 🔨 Built cvDataWithReport:', {
          summary: cvDataWithReport.summary?.substring(0, 100) || 'EMPTY',
          summaryLength: cvDataWithReport.summary?.length || 0,
          focus_summary: cvDataWithReport.focus_summary,
          skillsCount: cvDataWithReport.skills?.length || 0,
          skills: cvDataWithReport.skills,
          highlightsCount: cvDataWithReport.highlights?.length || 0,
          highlights: cvDataWithReport.highlights,
          experiencesCount: cvDataWithReport.experiences?.length || 0,
          experiences: cvDataWithReport.experiences
        });
        console.log('[Background] 🔨 Full cvDataWithReport JSON:', JSON.stringify(cvDataWithReport, null, 2));

        // Final validation before storing
        console.log('[Background] 🔍 Final validation before storing cvDataWithReport...');
        if (!cvDataWithReport.summary || cvDataWithReport.summary.trim().length === 0) {
          console.error('[Background] ❌ CRITICAL ERROR: cvDataWithReport.summary is empty!');
          cvDataWithReport.summary = 'Professional with relevant experience and skills.';
        }
        if (!cvDataWithReport.skills || cvDataWithReport.skills.length === 0) {
          console.error('[Background] ❌ CRITICAL ERROR: cvDataWithReport.skills is empty!');
          cvDataWithReport.skills = ['Professional Skills'];
        }
        
        generatedContent.cv = {
          ...cvDataWithReport,
          workExperiences: tailoredWorkExperiences
        };
        console.log('[Background] ✅ Tailored CV generated and stored in generatedContent.cv:', {
          hasSummary: !!cvDataWithReport.summary,
          summaryLength: cvDataWithReport.summary?.length || 0,
          summaryPreview: cvDataWithReport.summary?.substring(0, 100) || 'EMPTY',
          skillsCount: cvDataWithReport.skills?.length || 0,
          skills: cvDataWithReport.skills,
          highlightsCount: cvDataWithReport.highlights?.length || 0,
          experiencesCount: cvDataWithReport.experiences?.length || 0,
          generatedContentCvExists: !!generatedContent.cv,
          generatedContentCvSummary: generatedContent.cv?.summary?.substring(0, 100) || 'N/A'
        });

        // Save CV to database
        try {
          await saveCVToDatabase(
            {
              ...cvDataWithReport,
              workExperiences: tailoredWorkExperiences
            },
            userId,
            chatThread.id,
            null, // jobUrl - can be added if available
            jobData.title,
            jobData.company,
            tailoredReportForFlutter
          );
          console.log('[Background] ✅ CV saved to database');
        } catch (saveError) {
          console.error('[Background] ❌ Error saving CV to database:', saveError);
          console.error('[Background] ❌ Save error details:', {
            message: saveError.message,
            stack: saveError.stack
          });
          // Continue - CV generation succeeded even if save failed
        }
      } catch (error) {
        console.error('[Background] ❌ Error generating CV:', error);
        console.error('[Background] ❌ CV generation error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        
        // Try to create a minimal CV from original data as last resort
        try {
          console.log('[Background] 🔄 Attempting to create minimal CV from original data...');
          // Calculate match scores for fallback CV
          const fallbackUserSkills = cvData.user?.skills || [];
          const fallbackMatchBefore = calculateMatchPercentage(fallbackUserSkills, jobData.skills);
          const fallbackMatchAfter = calculateMatchPercentage(fallbackUserSkills, jobData.skills); // Same as before since no tailoring
          
          // Convert highlights to flat strings
          const fallbackHighlights = (cvData.workExperiences || [])
            .slice(0, 5)
            .map((exp, idx) => {
              const text = exp.description || `${exp.position || 'Position'} at ${exp.company || 'Company'}`;
              return text; // Return string directly
            })
            .filter(h => h.trim().length > 0);
          
          const minimalCV = {
            summary: cvData.user?.summary || 'Professional with relevant experience and skills.',
            focus_summary: null,
            skills: cvData.user?.skills || ['Professional Skills'],
            highlights: fallbackHighlights,
            experiences: (cvData.workExperiences || []).map((exp, idx) => ({
              index: idx,
              description: exp.description || `${exp.position || 'Position'} at ${exp.company || 'Company'}`
            })),
            matchBefore: fallbackMatchBefore,
            matchAfter: fallbackMatchAfter,
            changes: [],
            creditsUsed: 0 // Fallback CV - no credits charged
          };
          
          generatedContent.cv = minimalCV;
          console.log('[Background] ✅ Created minimal CV from original data:', {
            hasSummary: !!minimalCV.summary,
            summaryLength: minimalCV.summary.length,
            skillsCount: minimalCV.skills.length
          });
        } catch (fallbackError) {
          console.error('[Background] ❌ Even fallback CV creation failed:', fallbackError);
          // Continue with other content - CV generation failed completely
        }
      }
    } else if (preferences.cv && !userHasSkills) {
      console.log('[Background] ⚠️ CV generation skipped - user has no skills');
    }

    // Generate Interview QA if enabled and user has skills
    if (preferences.interview_qa && userHasSkills) {
      try {
        console.log('[Background] 🔎 Validation (Interview QA):', {
          profileSkillsCount: Array.isArray(userProfile?.skills) ? userProfile.skills.length : 0,
          jobRequirementsCount: Array.isArray(jobData.skills) ? jobData.skills.length : 0,
          jobDescriptionLength: (jobData.description || '').length,
          experienceLevel: jobData.experienceLevel || ''
        });
        console.log('[Background] ❓ Generating interview QA...');
        
        // Generate first batch (technical questions)
        const interviewQAResult = await generateInterviewQA({
          profile: userProfile,
          jobTitle: jobData.title,
          company: jobData.company,
          jobDescription: jobData.description,
          jobRequirements: jobData.skills,
          experienceLevel: jobData.experienceLevel,
          batchIndex: 1
        });

        if (interviewQAResult.items && interviewQAResult.items.length > 0) {
          // Deduct credits for interview QA generation
          let interviewQACredits = 0;
          try {
            const interviewQACost = calculateCostFromUsage(interviewQAResult.usage, 'Interview Q&A (batch 1)');
            interviewQACredits = interviewQACost.credits;
            if (interviewQACredits > 0) {
              const deducted = await deductCredits({
                credits: interviewQACredits,
                reason: 'Interview Q&A (batch 1)',
                userId: userId,
                source: 'deepseek',
                costDollars: interviewQACost.totalCost
              });
              if (deducted) {
                console.log('[Background] ✅ Credits deducted for interview QA:', interviewQACredits);
                // Notify popup to refresh credits
                chrome.runtime.sendMessage({ action: 'creditsUpdated' }).catch(() => {});
              } else {
                console.error('[Background] ⚠️ Failed to deduct credits for interview QA');
              }
            }
          } catch (creditError) {
            console.error('[Background] ❌ Error deducting credits for interview QA:', creditError);
          }
          
          generatedContent.interviewQA = [
            {
              batchIndex: 1,
              items: interviewQAResult.items,
              creditsUsed: interviewQACredits
            }
          ];
          console.log('[Background] ✅ Interview QA generated (batch 1,', interviewQAResult.items.length, 'questions, credits:', interviewQACredits, ')');
        } else {
          console.warn('[Background] ⚠️ Interview QA generation returned empty results');
        }

        // Optionally generate more batches (can be done in parallel or sequentially)
        // For now, just generate batch 1
      } catch (error) {
        console.error('[Background] ❌ Error generating interview QA:', error);
        console.error('[Background] ❌ Interview QA error details:', {
          message: error.message,
          stack: error.stack
        });
        // Continue - error already handled in generator
      }
    } else if (preferences.interview_qa && !userHasSkills) {
      console.log('[Background] ⚠️ Interview QA generation skipped - user has no skills');
    }

    // Create messages for generated content
    if (generatedContent.coverLetter || generatedContent.cv || generatedContent.interviewQA) {
      try {
        console.log('[Background] 📨 Creating messages for generated content...');
        console.log('[Background] 📨 Content to create messages for:', {
          hasCoverLetter: !!generatedContent.coverLetter,
          hasCV: !!generatedContent.cv,
          hasInterviewQA: !!generatedContent.interviewQA,
          cvDataSummary: generatedContent.cv?.summary?.substring(0, 100) || 'N/A',
          cvDataSummaryLength: generatedContent.cv?.summary?.length || 0,
          cvDataSkillsCount: generatedContent.cv?.skills?.length || 0,
          cvDataHighlightsCount: generatedContent.cv?.highlights?.length || 0,
          cvDataExperiencesCount: generatedContent.cv?.experiences?.length || 0
        });
        console.log('[Background] 📨 Full generatedContent.cv before passing:', JSON.stringify(generatedContent.cv, null, 2));
        
        const contentMessages = await createCVCoverLetterInterviewQAMessages(
          chatThread.id,
          generatedContent.coverLetter,
          generatedContent.cv,
          generatedContent.interviewQA,
          userId
        );
        generatedContent.messages = contentMessages;
        console.log('[Background] ✅ Content messages created:', contentMessages.length, 'messages');
      } catch (error) {
        console.error('[Background] ❌ Error creating content messages:', error);
        console.error('[Background] ❌ Message creation error details:', {
          message: error.message,
          stack: error.stack
        });
        // Continue - content was generated even if messages couldn't be created
      }
    } else {
      console.log('[Background] ℹ️ No content generated, skipping message creation');
    }

    // Generate Portfolio LAST (so the message appears at the end, like Flutter)
    try {
      const createPortfolioSetting = await Storage.get('createPortfolio');
      const createPortfolioEnabled =
        typeof createPortfolioSetting === 'boolean' ? createPortfolioSetting : true;

      const portfolioPrefEnabled = !!preferences.portfolio;

      if (!createPortfolioEnabled) {
        console.log('[Background] ℹ️ Portfolio skipped - disabled in extension Settings (createPortfolio)');
      } else if (!portfolioPrefEnabled) {
        console.log('[Background] ℹ️ Portfolio skipped - disabled in user message_preferences.portfolio');
      } else if (!userHasSkills) {
        console.log('[Background] ℹ️ Portfolio skipped - user has no skills');
      } else if (!chatThread || !chatThread.id) {
        console.log('[Background] ⚠️ Portfolio skipped - no chat thread available');
      } else {
        // Avoid duplicates for the same thread
        const client = await getSupabaseClient();
        const existing = await client
          .from('chat_messages')
          .select('id')
          .eq('thread_id', chatThread.id)
          .eq('metadata->>type', 'portfolio')
          .maybeSingle();
        if (existing && existing.id) {
          console.log('[Background] ℹ️ Portfolio already exists for this thread, skipping');
        } else {
          console.log('[Background] 🎨 Generating portfolio with Gemini...');

          // Fetch full CV data for richer prompts (even if CV generation was skipped)
          const cvData = await getCompleteCVData(userId);

          const buildCvContent = (cv) => {
            const u = cv?.user || {};
            const buf = [];
            buf.push(`Name: ${u.fullName || ''}`);
            buf.push(`Email: ${u.email || ''}`);
            buf.push(`Headline: ${u.headline || ''}`);
            buf.push(`Summary: ${u.summary || ''}`);
            buf.push(`Skills: ${(u.skills || []).join(', ')}`);
            buf.push(`Location: ${u.location || ''}`);
            buf.push(`LinkedIn: ${u.linkedin || ''}`);
            buf.push(`Phone: ${u.phone || ''}`);
            buf.push(`Website: ${u.website || ''}`);

            if (Array.isArray(cv?.workExperiences) && cv.workExperiences.length > 0) {
              buf.push('');
              buf.push('Experience:');
              for (const exp of cv.workExperiences) {
                const pos = exp?.position || '';
                const comp = exp?.company || '';
                const desc = exp?.description || '';
                buf.push(`- ${pos} at ${comp}`);
                if (String(desc).trim().length > 0) buf.push(`  ${desc}`);
              }
            }
            if (Array.isArray(cv?.educations) && cv.educations.length > 0) {
              buf.push('');
              buf.push('Education:');
              for (const edu of cv.educations) {
                buf.push(`- ${edu?.degree || ''} in ${edu?.field || 'N/A'} from ${edu?.institution || ''}`);
              }
            }
            if (Array.isArray(cv?.projects) && cv.projects.length > 0) {
              buf.push('');
              buf.push('Projects:');
              for (const p of cv.projects) {
                buf.push(`- ${p?.name || ''}`);
                if (p?.description) buf.push(`  ${p.description}`);
              }
            }
            return buf.join('\n').trim();
          };

          const cvContent = buildCvContent(cvData) || '';

          const jobInfo = analysisResult.jobData?.jobInfo || {};
          const jobDescriptionText =
            (jobInfo.description && String(jobInfo.description).trim().length > 0)
              ? jobInfo.description
              : '';
          const jobDataForPortfolio = {
            title: jobData.title,
            company: jobData.company,
            description: jobDescriptionText || jobData.description || ''
          };

          const requirements =
            Array.isArray(analysisResult.jobSkills) && analysisResult.jobSkills.length > 0
              ? analysisResult.jobSkills
              : (Array.isArray(jobData.skills) ? jobData.skills : []);

          const portfolioResult = await generatePortfolioHTML({
            cvContent,
            jobData: jobDataForPortfolio,
            jobRequirements: requirements,
            userProfile: userProfile,
            cvData: cvData,
            instructions: null
          });

          // Calculate & deduct credits (dynamic, based on actual usage)
          let portfolioCredits = 0;
          let portfolioCostDollars = 0;
          try {
            const cost = calculateGeminiCostFromUsage(portfolioResult.usage, 'Gemini Portfolio');
            portfolioCredits = cost.credits;
            portfolioCostDollars = cost.totalCost;
            if (portfolioCredits > 0) {
              const deducted = await deductCredits({
                credits: portfolioCredits,
                reason: 'Gemini Portfolio',
                userId,
                source: 'gemini',
                costDollars: portfolioCostDollars
              });
              if (deducted) {
                console.log('[Background] ✅ Credits deducted for portfolio:', portfolioCredits);
                chrome.runtime.sendMessage({ action: 'creditsUpdated' }).catch(() => {});
              } else {
                console.error('[Background] ⚠️ Failed to deduct credits for portfolio');
              }
            }
          } catch (creditError) {
            console.error('[Background] ❌ Error deducting credits for portfolio:', creditError);
          }

          // Upload to Storage + create chat message
          console.log('[Background] ☁️ Uploading portfolio to storage...');
          const upload = await uploadPortfolioToStorage({
            htmlContent: portfolioResult.html,
            userId
          });

          const portfolioTitle = `Portfolio for ${jobData.title} at ${jobData.company}`.trim();
          const portfolioMessage = await createPortfolioMessage(
            chatThread.id,
            upload.viewerUrl,
            portfolioTitle,
            portfolioCredits,
            userId
          );

          generatedContent.portfolio = {
            url: upload.viewerUrl,
            title: portfolioTitle,
            creditsUsed: portfolioCredits,
            messageId: portfolioMessage?.id || null
          };

          if (portfolioMessage) {
            generatedContent.messages = [...(generatedContent.messages || []), portfolioMessage];
          }

          console.log('[Background] ✅ Portfolio generated and message created:', {
            url: upload.viewerUrl,
            credits: portfolioCredits
          });
        }
      }
    } catch (portfolioOuterErr) {
      console.error('[Background] ❌ Portfolio generation failed (non-fatal):', portfolioOuterErr);
    }

    return generatedContent;
  } catch (error) {
    console.error('[Background] ❌ Fatal error in content generation:', error);
    console.error('[Background] ❌ Fatal error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    // Return partial results if available
    return generatedContent || {
      coverLetter: null,
      cv: null,
      interviewQA: null,
      messages: []
    };
  }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});
