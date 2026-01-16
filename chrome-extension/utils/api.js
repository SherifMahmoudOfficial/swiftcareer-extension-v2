/**
 * API Utilities
 * Handles calls to Supabase Edge Functions and database operations
 */

import { getSupabaseClient, getAccessToken } from './supabase.js';
import { Storage } from './storage.js';

/**
 * Call job_analysis edge function
 */
export async function callJobAnalysis(jobUrl, userId, userSkills = [], userProfile = {}) {
  console.log('[API] 🚀 Starting job analysis API call');
  
  // Get Supabase config (with defaults)
  const config = await Storage.getMultiple(['supabaseUrl', 'supabaseAnonKey']);
  const supabaseUrl = (config.supabaseUrl || 'https://xqztrdozodptapqlnyoj.supabase.co').replace(/\/$/, '');
  const supabaseAnonKey = config.supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenRyZG96b2RwdGFwcWxueW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MDg4OTUsImV4cCI6MjA4MDA4NDg5NX0.bEfbybiz-ncXoCK_DxvjKSLioFVVO3UoG4ztMMYf64o';
  
  const apiUrl = `${supabaseUrl}/functions/v1/job_analysis`;
  console.log('[API] 📡 Request URL:', apiUrl);
  
  const accessToken = await getAccessToken();

  if (!accessToken) {
    console.error('[API] ❌ No access token found');
    throw new Error('Not authenticated. Please sign in.');
  }

  const requestBody = {
    jobInput: jobUrl,
    userId,
    userSkills,
    userProfile
  };

  console.log('[API] 📤 Request body:', {
    jobInput: typeof jobUrl === 'string' && jobUrl.length > 100 ? `${jobUrl.substring(0, 100)}... (${jobUrl.length} chars)` : jobUrl,
    userId,
    userSkillsCount: userSkills.length,
    userProfile: {
      fullName: userProfile.fullName,
      email: userProfile.email,
      hasHeadline: !!userProfile.headline,
      hasSummary: !!userProfile.summary
    }
  });

  const requestHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'apikey': supabaseAnonKey
  };

  console.log('[API] 📋 Request headers:', {
    'Content-Type': requestHeaders['Content-Type'],
    'Authorization': `Bearer ${accessToken.substring(0, 20)}... (token length: ${accessToken.length})`,
    'apikey': `${supabaseAnonKey.substring(0, 20)}... (key length: ${supabaseAnonKey.length})`
  });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(requestBody)
  });

  console.log('[API] 📥 Response status:', response.status, response.statusText);
  console.log('[API] 📥 Response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[API] ❌ Response error:', errorData);
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[API] 📥 Response data:', {
    success: data.success,
    hasData: !!data.data,
    hasJobData: !!data.data?.jobData,
    hasMatchAnalysis: !!data.data?.matchAnalysis,
    jobSkillsCount: data.data?.jobSkills?.length || 0,
    isLinkedInUrl: data.data?.isLinkedInUrl
  });
  
  if (!data.success) {
    console.error('[API] ❌ API returned success: false:', data.error);
    throw new Error(data.error || 'Job analysis failed');
  }

  console.log('[API] ✅ Job analysis API call completed successfully');
  return data.data;
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
    
    // 3. Job Results Message
    console.log('[API] 📝 Creating job_results message');
    const jobResultsMessage = await createChatMessage(
      threadId,
      'assistant',
      'Job analyzed successfully',
      {
        type: 'job_results',
        jobResult: {
          title: jobInfo.title || '',
          company: jobInfo.company || '',
          location: jobInfo.location || '',
          level: jobInfo.experienceLevel || '',
          remote: false, // Can be extracted from jobInfo if available
          type: jobInfo.employmentType || ''
        },
        jobAnalysis: {
          jobDescription: jobInfo.description || jobDescription,
          jobSkills: analysisResult.jobSkills || [],
          userSkills: userSkills || [],
          skills: jobInfo.skills || analysisResult.jobSkills || []
        },
        jobLink: jobUrl || '',
        credits_used: 0
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
      
      // Transform improvedSkills from Edge Function format to required format
      // Edge Function returns: Array<{skill: string, suggestion: string}>
      // Required format: Array<{original: string, improved: string}>
      const improvedSkills = (matchAnalysis.improvedSkills || []).map(item => ({
        original: item.skill || item.original || '',
        improved: item.suggestion || item.improved || ''
      })).filter(item => item.original && item.improved); // Filter out empty items
      
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
          credits_used: 0
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
        cvContent += `- ${highlight.text}\n`;
      });
      cvContent += '\n';
    }

    const cvRecord = {
      user_id: userId,
      title: cvTitle,
      content: cvContent,
      job_url: jobUrl || '',
      thread_id: threadId,
      tailored_report: tailoredReport || {
        tailoredCvData: cvData,
        matchBefore: 0,
        matchAfter: 0,
        changes: []
      }
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
          credits_used: 0
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
      
      const cvMetadata = {
        type: 'cv',
        summary: String(cvData.summary || ''),
        focus_summary: cvData.focus_summary ? String(cvData.focus_summary) : null,
        matchBefore: typeof cvData.matchBefore === 'number' ? cvData.matchBefore : (typeof cvData.matchBefore === 'string' ? parseInt(cvData.matchBefore, 10) || 0 : 0),
        matchAfter: typeof cvData.matchAfter === 'number' ? cvData.matchAfter : (typeof cvData.matchAfter === 'string' ? parseInt(cvData.matchAfter, 10) || 0 : 0),
        highlights: flatHighlights, // Flat strings for Flutter compatibility
        skills: flatSkills, // Ensure all are strings
        experiences: experiences, // Simple objects with index and description
        changes: flatChanges, // Flat strings
        isGenerating: false,
        credits_used: 0
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
              credits_used: 0
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
