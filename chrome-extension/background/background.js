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
  createCVCoverLetterInterviewQAMessages
} from '../utils/api.js';
import { getCurrentUser, isAuthenticated, getAccessToken, getSupabaseClient } from '../utils/supabase.js';
import { generateCoverLetter, generateInterviewQA, generateTailoredCV } from '../utils/generators.js';
import { getCompleteCVData } from '../utils/cv_data.js';

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
            website: profile.website
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
          // Try to use Apify first (send jobUrl)
          console.log('[Background] 🌐 Calling job analysis API with URL:', request.jobUrl);
          console.log('[Background] 📤 API Request data:', {
            jobUrl: request.jobUrl,
            userId: request.userId,
            userSkillsCount: userSkills.length,
            hasUserProfile: Object.keys(userProfile).length > 0
          });
          
          analysisResult = await callJobAnalysis(
            request.jobUrl,
            request.userId,
            userSkills,
            userProfile
          );

          console.log('[Background] ✅ Job analysis API response received:', {
            hasJobData: !!analysisResult.jobData,
            hasMatchAnalysis: !!analysisResult.matchAnalysis,
            jobSkillsCount: analysisResult.jobSkills?.length || 0,
            isLinkedInUrl: analysisResult.isLinkedInUrl
          });

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
        preferences: { cv: true, cover_letter: true, interview_qa: true },
        hasSkills: false
      };
    }

    // Default preferences if not set
    const defaultPreferences = {
      cv: true,
      cover_letter: true,
      interview_qa: true
    };

    const preferences = (data.message_preferences && typeof data.message_preferences === 'object') 
      ? data.message_preferences 
      : defaultPreferences;
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
      preferences: { cv: true, cover_letter: true, interview_qa: true },
      hasSkills: false
    };
  }
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
    messages: []
  };

  try {
    // Generate Cover Letter if enabled
    if (preferences.cover_letter) {
      try {
        console.log('[Background] 📝 Generating cover letter...');
        const coverLetterContent = await generateCoverLetter({
          profile: userProfile,
          jobTitle: jobData.title,
          company: jobData.company,
          jobDescription: jobData.description,
          jobUrl: null, // Can be added if needed
          instructions: null // Can be added if needed
        });

        if (coverLetterContent && coverLetterContent.trim().length > 0) {
          generatedContent.coverLetter = {
            content: coverLetterContent,
            instructions: null
          };
          console.log('[Background] ✅ Cover letter generated (length:', coverLetterContent.length, 'chars)');
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
        console.log('[Background] 📄 Generating tailored CV...');
        
        // Get complete CV data
        const cvData = await getCompleteCVData(userId);
        console.log('[Background] 📋 CV data fetched:', {
          hasUser: !!cvData.user,
          workExperiencesCount: cvData.workExperiences?.length || 0,
          projectsCount: cvData.projects?.length || 0
        });
        
        // Generate tailored CV
        const tailoredPatch = await generateTailoredCV({
          cvData: cvData,
          jobData: jobData,
          jobSkills: jobData.skills,
          userInstructions: null,
          focusLabel: null
        });

        // Build CV data structure
        const cvDataWithReport = {
          summary: tailoredPatch.summary || cvData.user.summary,
          focus_summary: tailoredPatch.focus_summary,
          skills: tailoredPatch.skills || cvData.user.skills,
          highlights: tailoredPatch.highlights || [],
          experiences: tailoredPatch.experiences || [],
          matchBefore: 0, // Can be calculated if needed
          matchAfter: 0, // Can be calculated if needed
          changes: [] // Can be populated if needed
        };

        generatedContent.cv = cvDataWithReport;
        console.log('[Background] ✅ Tailored CV generated:', {
          hasSummary: !!cvDataWithReport.summary,
          skillsCount: cvDataWithReport.skills?.length || 0,
          highlightsCount: cvDataWithReport.highlights?.length || 0
        });

        // Save CV to database
        try {
          await saveCVToDatabase(
            cvDataWithReport,
            userId,
            chatThread.id,
            null, // jobUrl - can be added if available
            jobData.title,
            jobData.company,
            {
              tailoredCvData: cvDataWithReport,
              matchBefore: 0,
              matchAfter: 0,
              changes: []
            }
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
          stack: error.stack
        });
        // Continue with other content - error already handled in generator
      }
    } else if (preferences.cv && !userHasSkills) {
      console.log('[Background] ⚠️ CV generation skipped - user has no skills');
    }

    // Generate Interview QA if enabled and user has skills
    if (preferences.interview_qa && userHasSkills) {
      try {
        console.log('[Background] ❓ Generating interview QA...');
        
        // Generate first batch (technical questions)
        const interviewQABatch1 = await generateInterviewQA({
          profile: userProfile,
          jobTitle: jobData.title,
          company: jobData.company,
          jobDescription: jobData.description,
          jobRequirements: jobData.skills,
          experienceLevel: jobData.experienceLevel,
          batchIndex: 1
        });

        if (interviewQABatch1 && interviewQABatch1.length > 0) {
          generatedContent.interviewQA = [
            {
              batchIndex: 1,
              items: interviewQABatch1
            }
          ];
          console.log('[Background] ✅ Interview QA generated (batch 1,', interviewQABatch1.length, 'questions)');
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
