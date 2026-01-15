/**
 * Content Generation Utilities
 * Generates CV, Cover Letter, and Interview QA using DeepSeek API
 */

import { Storage } from './storage.js';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// Default DeepSeek API Key (hardcoded)
const DEFAULT_DEEPSEEK_API_KEY = 'sk-80e102cca06342c48c385c5f0247a110';

/**
 * Get DeepSeek API key from storage or use default
 */
async function getDeepSeekApiKey() {
  const apiKey = await Storage.get('DEEPSEEK_API_KEY');
  if (apiKey) {
    return apiKey;
  }
  // Use default key if not configured
  console.log('[Generators] ℹ️ Using default DeepSeek API key');
  return DEFAULT_DEEPSEEK_API_KEY;
}

/**
 * Call DeepSeek API
 */
async function callDeepSeekAPI(messages, temperature = 0.45, responseFormat = null, timeout = 60000) {
  console.log('[Generators] 🤖 Calling DeepSeek API:', {
    messagesCount: messages.length,
    temperature,
    hasResponseFormat: !!responseFormat,
    timeout
  });

  const apiKey = await getDeepSeekApiKey();

  const requestBody = {
    model: DEEPSEEK_MODEL,
    messages: messages,
    temperature: temperature
  };

  if (responseFormat) {
    requestBody.response_format = responseFormat;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Generators] ❌ DeepSeek API error:', errorText);
      throw new Error(`DeepSeek API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log('[Generators] ✅ DeepSeek API response received:', {
      contentLength: content.length,
      hasContent: !!content
    });

    return content;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('DeepSeek API request timeout');
    }
    throw error;
  }
}

/**
 * Generate Cover Letter
 * @param {Object} params - Generation parameters
 * @param {Object} params.profile - User profile data
 * @param {string} params.jobTitle - Job title
 * @param {string} params.company - Company name
 * @param {string} params.jobDescription - Job description
 * @param {string} params.jobUrl - Job URL (optional)
 * @param {string} params.instructions - User instructions (optional)
 * @returns {Promise<string>} Generated cover letter text
 */
export async function generateCoverLetter({
  profile,
  jobTitle,
  company,
  jobDescription,
  jobUrl = null,
  instructions = null
}) {
  console.log('[Generators] 📝 Generating cover letter:', {
    jobTitle,
    company,
    hasInstructions: !!instructions,
    descriptionLength: jobDescription?.length || 0
  });

  const systemPrompt = `You are an expert cover letter writer for job applications.

Write a tailored cover letter using ONLY the provided candidate profile and job context. Do not fabricate employers, degrees, or achievements.

Output rules:
- Output plain text only (no markdown, no JSON).
- 180-320 words unless the user instructions specify otherwise.
- Use the SAME language as the user instructions when present; otherwise match the job description language.
- Structure: Greeting, 2-3 short paragraphs, closing, signature with the candidate name.
- Be specific and quantify impact when possible, but do not invent numbers.`;

  // Clip long text fields
  const summary = profile.summary ? profile.summary.substring(0, 1200) : '';
  const description = jobDescription ? jobDescription.substring(0, 2500) : '';
  const userInstructions = instructions ? instructions.substring(0, 800) : 'None';

  const userPrompt = `Candidate profile:
Name: ${profile.fullName || ''}
Email: ${profile.email || ''}
Headline: ${profile.headline || ''}
Location: ${profile.location || ''}
LinkedIn: ${profile.linkedin || 'N/A'}
Summary: ${summary}
Skills: ${(profile.skills || []).join(', ')}

Job:
Title: ${jobTitle}
Company: ${company}
Job URL: ${jobUrl || 'N/A'}
Job description:
${description}

User instructions (optional):
${userInstructions}

Write the cover letter now.`;

  try {
    const content = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      0.45, // temperature
      null, // no response format (plain text)
      60000 // 60 seconds timeout
    );

    const coverLetter = content.trim();
    console.log('[Generators] ✅ Cover letter generated:', {
      length: coverLetter.length,
      wordCount: coverLetter.split(/\s+/).length
    });

    return coverLetter;
  } catch (error) {
    console.error('[Generators] ❌ Error generating cover letter:', error);
    // Return fallback stub content instead of throwing
    if (error.message && error.message.includes('API key not configured')) {
      throw error; // Re-throw configuration errors
    }
    console.warn('[Generators] ⚠️ Returning fallback cover letter');
    return `Dear Hiring Manager,

I am writing to express my interest in the ${jobTitle} position at ${company}. Based on the job description, I believe my skills and experience align well with your requirements.

I look forward to the opportunity to discuss how my background can contribute to your team.

Best regards,
${profile.fullName || 'Candidate'}`;
  }
}

/**
 * Generate Interview QA
 * @param {Object} params - Generation parameters
 * @param {Object} params.profile - User profile data
 * @param {string} params.jobTitle - Job title
 * @param {string} params.company - Company name
 * @param {string} params.jobDescription - Job description
 * @param {Array<string>} params.jobRequirements - Job skills/requirements
 * @param {string} params.experienceLevel - Experience level (optional)
 * @param {number} params.batchIndex - Batch index (1-5)
 * @returns {Promise<Array>} Array of {q, a} objects
 */
export async function generateInterviewQA({
  profile,
  jobTitle,
  company,
  jobDescription,
  jobRequirements = [],
  experienceLevel = null,
  batchIndex = 1
}) {
  console.log('[Generators] ❓ Generating interview QA batch:', {
    batchIndex,
    jobTitle,
    company,
    requirementsCount: jobRequirements.length
  });

  const batchFocuses = {
    1: 'Focus on role-specific TECHNICAL questions about skills, tools, and technologies mentioned in the job.',
    2: 'Focus on BEHAVIORAL questions using STAR method (Tell me about a time when...).',
    3: 'Focus on PROBLEM-SOLVING and SCENARIO-based questions (What would you do if..., How would you handle...).',
    4: 'Focus on MOTIVATION and CULTURE FIT questions (Why this company, career goals, work style).'
  };

  const batchFocus = batchFocuses[batchIndex] || 
    `Focus on ADVANCED and EDGE-CASE questions that test deeper expertise and critical thinking. Batch #${batchIndex}.`;

  const systemPrompt = `You are an interview coach. Output the result as a JSON object only. The object must include an array "items" of exactly 5 elements and nothing else. Each element has: {"q": string, "a": string}. Keep answers concise (2-4 sentences), practical, and tailored to the role.

IMPORTANT - This is batch #${batchIndex}: ${batchFocus}

Generate questions that are DIFFERENT from typical generic questions. Make them specific to the job requirements and responsibilities mentioned.`;

  // Clip job description
  const description = jobDescription ? jobDescription.substring(0, 2000) : '';

  const userPrompt = `Profile: ${profile.fullName || ''} | ${profile.headline || ''} | Skills: ${(profile.skills || []).join(', ')} | Location: ${profile.location || ''}

Role: "${jobTitle}" at "${company}"

${experienceLevel ? `Experience Level: ${experienceLevel}` : ''}

${description ? `Job Description: ${description}` : ''}

${jobRequirements && jobRequirements.length > 0 ? `Required Skills/Technologies: ${jobRequirements.join(', ')}` : ''}

Generate 5 expected interview questions and concise answers. Return JSON with {"items":[{"q":"...","a":"..."}, ...]}.`;

  try {
    const content = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      0.55, // temperature
      { type: 'json_object' }, // JSON response format
      45000 // 45 seconds timeout
    );

    const parsed = JSON.parse(content);
    const items = parsed.items || [];

    if (items.length !== 5) {
      console.warn('[Generators] ⚠️ Expected 5 items, got:', items.length);
    }

    console.log('[Generators] ✅ Interview QA generated:', {
      batchIndex,
      itemsCount: items.length
    });

    return items;
  } catch (error) {
    console.error('[Generators] ❌ Error generating interview QA:', error);
    // Return fallback stub content instead of throwing
    if (error.message && error.message.includes('API key not configured')) {
      throw error; // Re-throw configuration errors
    }
    console.warn('[Generators] ⚠️ Returning fallback interview QA');
    return [
      { q: `Why are you interested in the ${jobTitle} position at ${company}?`, a: 'I am interested in this role because it aligns with my career goals and allows me to contribute my skills to your team.' },
      { q: 'What relevant experience do you have?', a: 'I have experience in the required skills and technologies mentioned in the job description.' },
      { q: 'How do you handle challenges?', a: 'I approach challenges systematically, breaking them down into manageable steps and seeking solutions collaboratively.' },
      { q: 'What are your strengths?', a: 'My strengths include problem-solving, attention to detail, and the ability to work effectively in a team environment.' },
      { q: 'Where do you see yourself in 5 years?', a: 'I see myself growing within the company, taking on more responsibilities, and contributing to the team\'s success.' }
    ];
  }
}

/**
 * Generate Tailored CV
 * @param {Object} params - Generation parameters
 * @param {Object} params.cvData - Complete CV data (user profile + experiences + projects + etc.)
 * @param {Object} params.jobData - Job information
 * @param {Array<string>} params.jobSkills - Job skills
 * @param {string} params.userInstructions - User instructions (optional)
 * @param {string} params.focusLabel - Focus keywords (optional)
 * @returns {Promise<Object>} Tailored CV data with report
 */
export async function generateTailoredCV({
  cvData,
  jobData,
  jobSkills,
  userInstructions = null,
  focusLabel = null
}) {
  console.log('[Generators] 📄 Generating tailored CV:', {
    jobTitle: jobData.title,
    company: jobData.company,
    jobSkillsCount: jobSkills.length,
    hasInstructions: !!userInstructions,
    hasFocusLabel: !!focusLabel
  });

  const systemPrompt = `You are a professional CV tailoring expert. Your PRIMARY GOAL is to MAXIMIZE the job match percentage by making AGGRESSIVE, SIGNIFICANT improvements.

CRITICAL RULES:
1. NEVER add information that is not present in the original CV data
2. ONLY rephrase, prioritize, and select from existing information
3. Use synonyms and keywords from the job description intelligently
4. Focus on aspects most relevant to the job requirements

Return ONLY valid JSON with this structure:
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
}`;

  // Build comprehensive user prompt
  const userPrompt = buildCVTailoringPrompt(cvData, jobData, userInstructions, focusLabel);

  try {
    const content = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      0.55, // temperature
      { type: 'json_object' }, // JSON response format
      90000 // 90 seconds timeout
    );

    const tailoredPatch = JSON.parse(content);
    
    console.log('[Generators] ✅ Tailored CV generated:', {
      hasSummary: !!tailoredPatch.summary,
      skillsCount: tailoredPatch.skills?.length || 0,
      highlightsCount: tailoredPatch.highlights?.length || 0,
      experiencesCount: tailoredPatch.experiences?.length || 0
    });

    return tailoredPatch;
  } catch (error) {
    console.error('[Generators] ❌ Error generating tailored CV:', error);
    // Return fallback stub content instead of throwing
    if (error.message && error.message.includes('API key not configured')) {
      throw error; // Re-throw configuration errors
    }
    console.warn('[Generators] ⚠️ Returning fallback CV data');
    // Return original CV data structure as fallback
    return {
      summary: cvData.user?.summary || '',
      focus_summary: null,
      skills: cvData.user?.skills || [],
      highlights: [],
      experiences: []
    };
  }
}

/**
 * Build comprehensive CV tailoring prompt
 */
function buildCVTailoringPrompt(cvData, jobData, userInstructions, focusLabel) {
  let prompt = `Job Information:
Title: ${jobData.title || ''}
Company: ${jobData.company || ''}
Location: ${jobData.location || ''}
Experience Level: ${jobData.experienceLevel || ''}
Employment Type: ${jobData.employmentType || ''}

Job Description:
${jobData.description || ''}

Required Skills: ${(jobData.skills || []).join(', ')}

`;

  if (userInstructions) {
    prompt += `User Instructions:
${userInstructions.substring(0, 800)}

`;
  }

  if (focusLabel) {
    prompt += `Focus Keywords: ${focusLabel}

`;
  }

  prompt += `Candidate CV Data:

User Profile:
Name: ${cvData.user?.fullName || ''}
Headline: ${cvData.user?.headline || ''}
Summary: ${cvData.user?.summary || ''}
Skills: ${(cvData.user?.skills || []).join(', ')}
Location: ${cvData.user?.location || ''}

`;

  if (cvData.workExperiences && cvData.workExperiences.length > 0) {
    prompt += `Work Experiences:\n`;
    cvData.workExperiences.forEach((exp, index) => {
      prompt += `${index}. ${exp.position || ''} at ${exp.company || ''} (${exp.startDate || ''} - ${exp.endDate || 'Present'})\n`;
      prompt += `   Description: ${exp.description || ''}\n\n`;
    });
  }

  if (cvData.projects && cvData.projects.length > 0) {
    prompt += `Projects:\n`;
    cvData.projects.forEach((project, index) => {
      prompt += `${index}. ${project.name || ''}\n`;
      prompt += `   Description: ${project.description || ''}\n`;
      prompt += `   Technologies: ${(project.technologies || []).join(', ')}\n\n`;
    });
  }

  if (cvData.educations && cvData.educations.length > 0) {
    prompt += `Education:\n`;
    cvData.educations.forEach((edu, index) => {
      prompt += `${index}. ${edu.degree || ''} in ${edu.field || ''} from ${edu.institution || ''}\n\n`;
    });
  }

  prompt += `\nTailor this CV to maximize job match. Return JSON with the structure specified in the system prompt.`;

  return prompt;
}
