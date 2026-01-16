/**
 * Content Generation Utilities
 * Generates CV, Cover Letter, and Interview QA using DeepSeek API
 */

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// DeepSeek API Key (hardcoded)
// NOTE: Intentionally not configurable via the Options page.
const DEEPSEEK_API_KEY = 'sk-80e102cca06342c48c385c5f0247a110';

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

  const apiKey = DEEPSEEK_API_KEY;

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
    
    // Extract usage information
    const usage = {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
      cached_tokens: data.usage?.cached_tokens || 0 // DeepSeek may provide this
    };
    
    console.log('[Generators] ✅ DeepSeek API response received:', {
      contentLength: content.length,
      hasContent: !!content,
      tokens: usage.total_tokens,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      cachedTokens: usage.cached_tokens
    });

    return { content, usage };
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
 * @returns {Promise<{content: string, usage: Object}>} Generated cover letter text and token usage
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
    const result = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      0.45, // temperature
      null, // no response format (plain text)
      60000 // 60 seconds timeout
    );

    const coverLetter = result.content.trim();
    console.log('[Generators] ✅ Cover letter generated:', {
      length: coverLetter.length,
      wordCount: coverLetter.split(/\s+/).length,
      tokens: result.usage.total_tokens
    });

    return { content: coverLetter, usage: result.usage };
  } catch (error) {
    console.error('[Generators] ❌ Error generating cover letter:', error);
    // Return fallback stub content instead of throwing
    if (error.message && error.message.includes('API key not configured')) {
      throw error; // Re-throw configuration errors
    }
    console.warn('[Generators] ⚠️ Returning fallback cover letter');
    const fallbackContent = `Dear Hiring Manager,

I am writing to express my interest in the ${jobTitle} position at ${company}. Based on the job description, I believe my skills and experience align well with your requirements.

I look forward to the opportunity to discuss how my background can contribute to your team.

Best regards,
${profile.fullName || 'Candidate'}`;
    return { 
      content: fallbackContent, 
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0 } 
    };
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
 * @returns {Promise<{items: Array, usage: Object}>} Array of {q, a} objects and token usage
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
    const result = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      0.55, // temperature
      { type: 'json_object' }, // JSON response format
      45000 // 45 seconds timeout
    );

    const parsed = JSON.parse(result.content);
    const items = parsed.items || [];

    if (items.length !== 5) {
      console.warn('[Generators] ⚠️ Expected 5 items, got:', items.length);
    }

    console.log('[Generators] ✅ Interview QA generated:', {
      batchIndex,
      itemsCount: items.length,
      tokens: result.usage.total_tokens
    });

    return { items, usage: result.usage };
  } catch (error) {
    console.error('[Generators] ❌ Error generating interview QA:', error);
    // Return fallback stub content instead of throwing
    if (error.message && error.message.includes('API key not configured')) {
      throw error; // Re-throw configuration errors
    }
    console.warn('[Generators] ⚠️ Returning fallback interview QA');
    const fallbackItems = [
      { q: `Why are you interested in the ${jobTitle} position at ${company}?`, a: 'I am interested in this role because it aligns with my career goals and allows me to contribute my skills to your team.' },
      { q: 'What relevant experience do you have?', a: 'I have experience in the required skills and technologies mentioned in the job description.' },
      { q: 'How do you handle challenges?', a: 'I approach challenges systematically, breaking them down into manageable steps and seeking solutions collaboratively.' },
      { q: 'What are your strengths?', a: 'My strengths include problem-solving, attention to detail, and the ability to work effectively in a team environment.' },
      { q: 'Where do you see yourself in 5 years?', a: 'I see myself growing within the company, taking on more responsibilities, and contributing to the team\'s success.' }
    ];
    return { 
      items: fallbackItems, 
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0 } 
    };
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
 * @returns {Promise<{patch: Object, usage: Object}>} Tailored CV data with report and token usage
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
    hasFocusLabel: !!focusLabel,
    cvDataSummary: cvData.user?.summary?.substring(0, 100) || 'N/A',
    workExperiencesCount: cvData.workExperiences?.length || 0,
    projectsCount: cvData.projects?.length || 0
  });

  const systemPrompt =
    'You are a professional CV tailoring expert. Your goal is to MAXIMIZE job match by making AGGRESSIVE improvements while strictly adhering to the original data. Output only valid JSON.';

  // Build comprehensive user prompt
  const userPrompt = buildCVTailoringPrompt(cvData, jobData, userInstructions, focusLabel);
  
  console.log('[Generators] 📤 Sending request to DeepSeek API...');
  console.log('[Generators] 📋 Prompt length:', userPrompt.length, 'characters');
  console.log('[Generators] 📋 Prompt preview (first 500 chars):', userPrompt.substring(0, 500));

  try {
    const result = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      0.55, // temperature
      { type: 'json_object' }, // JSON response format
      90000 // 90 seconds timeout
    );

    console.log('[Generators] 📥 Received response from DeepSeek API');
    console.log('[Generators] 📥 Response length:', result.content.length, 'characters');
    console.log('[Generators] 📥 Response preview (first 500 chars):', result.content.substring(0, 500));
    console.log('[Generators] 📥 Token usage:', result.usage.total_tokens);

    // Parse JSON with detailed error handling
    let tailoredPatch;
    try {
      // Try to extract JSON if wrapped in markdown code blocks
      let jsonContent = result.content.trim();
      if (jsonContent.startsWith('```')) {
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonContent = jsonMatch[1].trim();
          console.log('[Generators] 🔧 Extracted JSON from markdown code block');
        }
      }
      
      tailoredPatch = JSON.parse(jsonContent);
      console.log('[Generators] ✅ JSON parsed successfully');
    } catch (parseError) {
      console.error('[Generators] ❌ JSON parsing failed:', parseError);
      console.error('[Generators] ❌ Raw response:', content);
      console.error('[Generators] ❌ Parse error details:', {
        message: parseError.message,
        name: parseError.name
      });
      // Don't throw - use fallback strategy instead
      console.warn('[Generators] ⚠️ Using fallback strategy due to JSON parse error');
      tailoredPatch = null;
    }

    // Validate and build validated patch with smart fallback
    console.log('[Generators] 🔍 Validating parsed data...');
    
    if (!tailoredPatch || typeof tailoredPatch !== 'object') {
      console.warn('[Generators] ⚠️ Invalid tailoredPatch, using fallback');
      tailoredPatch = {};
    }
    
    console.log('[Generators] 🔍 Parsed data keys:', Object.keys(tailoredPatch || {}));
    console.log('[Generators] 🔍 Has summary:', !!tailoredPatch?.summary, 'Length:', tailoredPatch?.summary?.length || 0);
    console.log('[Generators] 🔍 Has focus_summary:', !!tailoredPatch?.focus_summary);
    console.log('[Generators] 🔍 Skills:', tailoredPatch?.skills?.length || 0, 'items');
    console.log('[Generators] 🔍 Highlights:', tailoredPatch?.highlights?.length || 0, 'items');
    console.log('[Generators] 🔍 Experiences:', tailoredPatch?.experiences?.length || 0, 'items');

    // Smart fallback strategy: merge API response with original data
    // Priority: API response > Original CV data > Empty defaults (but never completely empty)
    const originalSummary = cvData.user?.summary || '';
    const originalSkills = cvData.user?.skills || [];
    const originalExperiences = cvData.workExperiences || [];
    
    // Build validated patch with intelligent fallback
    let validatedSummary = '';
    if (tailoredPatch.summary && typeof tailoredPatch.summary === 'string' && tailoredPatch.summary.trim().length > 0) {
      validatedSummary = tailoredPatch.summary.trim();
      console.log('[Generators] ✅ Using API summary (length:', validatedSummary.length, ')');
    } else if (originalSummary && originalSummary.trim().length > 0) {
      validatedSummary = originalSummary.trim();
      console.log('[Generators] ⚠️ API summary empty, using original summary (length:', validatedSummary.length, ')');
    } else {
      // Last resort: create a basic summary WITHOUT fabricating years/metrics.
      const skillsText =
        originalSkills.length > 0 ? originalSkills.slice(0, 5).join(', ') : 'relevant skills';
      const rolesText =
        originalExperiences.length > 0 ? `${originalExperiences.length} role(s)` : 'professional roles';
      validatedSummary = `Professional with experience across ${rolesText} and skills in ${skillsText}.`;
      console.log('[Generators] ⚠️ No summary available, created non-fabricated fallback summary');
    }

    const normalize = (s) =>
      String(s ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    // Build a conservative allow-list for skills so we never "invent" skills.
    const allowedSkills = new Set(
      (originalSkills || [])
        .map((s) => normalize(s))
        .filter((s) => s.length > 0)
    );
    const originalTextBlob = [
      originalSummary,
      ...(Array.isArray(originalExperiences) ? originalExperiences.map((e) => e?.description || '') : []),
      ...(Array.isArray(cvData?.projects) ? cvData.projects.map((p) => p?.description || '') : [])
    ]
      .join('\n')
      .toLowerCase();
    // Also allow project technologies explicitly.
    (Array.isArray(cvData?.projects) ? cvData.projects : []).forEach((p) => {
      (Array.isArray(p?.technologies) ? p.technologies : []).forEach((t) => {
        const n = normalize(t);
        if (n.length > 0) allowedSkills.add(n);
      });
    });

    let validatedSkills = [];
    if (Array.isArray(tailoredPatch.skills) && tailoredPatch.skills.length > 0) {
      const originalCount = tailoredPatch.skills.length;
      validatedSkills = tailoredPatch.skills
        .filter((s) => s && typeof s === 'string' && s.trim().length > 0)
        .filter((s) => {
          const n = normalize(s);
          if (!n) return false;
          if (allowedSkills.has(n)) return true;
          // If the term already exists verbatim in the user's original text, it's not invented.
          return originalTextBlob.includes(n);
        });
      if (validatedSkills.length < originalCount) {
        console.warn(
          '[Generators] ⚠️ Dropped skills not found in source CV data:',
          originalCount - validatedSkills.length
        );
      }
      console.log('[Generators] ✅ Using API skills (count:', validatedSkills.length, ')');
    }
    if (validatedSkills.length === 0 && originalSkills.length > 0) {
      validatedSkills = [...originalSkills];
      console.log('[Generators] ⚠️ API skills empty, using original skills (count:', validatedSkills.length, ')');
    }

    let validatedHighlights = [];
    if (Array.isArray(tailoredPatch.highlights) && tailoredPatch.highlights.length > 0) {
      validatedHighlights = tailoredPatch.highlights.filter(h => 
        h && typeof h === 'object' && 
        h.text && typeof h.text === 'string' && h.text.trim().length > 0
      );
      console.log('[Generators] ✅ Using API highlights (count:', validatedHighlights.length, ')');
    }
    // If highlights are empty but we have experiences, create highlights from experiences
    if (validatedHighlights.length === 0 && originalExperiences.length > 0) {
      validatedHighlights = originalExperiences
        .slice(0, 5)
        .filter(exp => exp.description && exp.description.trim().length > 0)
        .map((exp, idx) => ({
          text: exp.description.substring(0, 150) + (exp.description.length > 150 ? '...' : ''),
          source: 'experience',
          index: idx
        }));
      console.log('[Generators] ⚠️ API highlights empty, created from experiences (count:', validatedHighlights.length, ')');
    }

    // Experiences: ensure we always return one item per original experience index.
    const originalExperiencesCount = Array.isArray(originalExperiences) ? originalExperiences.length : 0;
    const experiencesByIndex = {};
    if (Array.isArray(tailoredPatch.experiences) && tailoredPatch.experiences.length > 0) {
      tailoredPatch.experiences.forEach((exp) => {
        if (!exp || typeof exp !== 'object') return;
        const rawIndex = exp.index;
        const idx =
          typeof rawIndex === 'number'
            ? rawIndex
            : parseInt(String(rawIndex ?? ''), 10);
        const desc = typeof exp.description === 'string' ? exp.description.trim() : '';
        if (Number.isNaN(idx) || idx === null) return;
        if (!desc) return;
        experiencesByIndex[String(idx)] = desc;
      });
    }

    const missingExperienceIndices = [];
    for (let i = 0; i < originalExperiencesCount; i++) {
      if (!experiencesByIndex[String(i)]) missingExperienceIndices.push(i);
    }

    let usedExperienceFallback = false;
    if (originalExperiencesCount > 0 && missingExperienceIndices.length > 0) {
      usedExperienceFallback = true;
      console.warn('[Generators] ⚠️ Tailored experiences missing indices, will fallback for now:', missingExperienceIndices);
      // Temporary fallback values for missing ones (original description).
      missingExperienceIndices.forEach((i) => {
        const exp = originalExperiences[i] || {};
        const d = (exp.description || '').toString().trim();
        experiencesByIndex[String(i)] = d.length > 0 ? d : `${exp.position || 'Position'} at ${exp.company || 'Company'}`;
      });
    }

    let validatedExperiences = [];
    if (originalExperiencesCount > 0) {
      validatedExperiences = Array.from({ length: originalExperiencesCount }, (_, i) => ({
        index: i,
        description: experiencesByIndex[String(i)] || ''
      }));
    } else {
      validatedExperiences = [];
    }

    if (Array.isArray(validatedExperiences) && validatedExperiences.length > 0) {
      console.log('[Generators] ✅ Built experiences array (count:', validatedExperiences.length, ')');
    }

    const validatedPatch = {
      summary: validatedSummary,
      focus_summary: tailoredPatch.focus_summary || null,
      skills: validatedSkills,
      highlights: validatedHighlights,
      experiences: validatedExperiences
    };

    // If the API didn't return full experiences, do a targeted retry (experiences-only) before returning.
    if (usedExperienceFallback && originalExperiencesCount > 0) {
      console.log('[Generators] 🔁 Retrying CV tailoring for experiences only (to avoid leaving descriptions unchanged)...');

      const safeJob = jobData?.jobInfo ? jobData.jobInfo : (jobData || {});
      const retryPromptParts = [];
      retryPromptParts.push('You MUST output ONLY valid JSON.');
      retryPromptParts.push('CRITICAL HONESTY RULES:');
      retryPromptParts.push('- Do NOT add any new facts, years, metrics, tools, or responsibilities not in the original descriptions.');
      retryPromptParts.push('- Only rephrase the wording to better match the job description keywords.');
      retryPromptParts.push('');
      retryPromptParts.push('JOB DESCRIPTION:');
      retryPromptParts.push(String(safeJob.description ?? jobData?.description ?? ''));
      retryPromptParts.push('');
      retryPromptParts.push('USER_CV_JSON (SOURCE OF TRUTH):');
      retryPromptParts.push(JSON.stringify({
        workExperiences: (Array.isArray(originalExperiences) ? originalExperiences : []).map((e) => ({
          company: e?.company ?? '',
          position: e?.position ?? '',
          startDate: e?.startDate ?? '',
          endDate: e?.endDate ?? '',
          current: !!e?.current,
          description: e?.description ?? ''
        }))
      }));
      retryPromptParts.push('');
      retryPromptParts.push('TASK: Return exactly this JSON shape:');
      retryPromptParts.push('{"experiences":[{"index":0,"description":"..."}]}');
      retryPromptParts.push('You MUST include an item for EVERY index from 0 to ' + (originalExperiencesCount - 1) + '.');

      try {
        const retryResult = await callDeepSeekAPI(
          [
            {
              role: 'system',
              content:
                'You are a CV tailoring expert. Strictly adhere to source data. Output only valid JSON.'
            },
            { role: 'user', content: retryPromptParts.join('\n') }
          ],
          0.2,
          { type: 'json_object' },
          60000
        );

        let retryJson = null;
        try {
          let jsonContent = retryResult.content.trim();
          if (jsonContent.startsWith('```')) {
            const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) jsonContent = jsonMatch[1].trim();
          }
          retryJson = JSON.parse(jsonContent);
        } catch (e) {
          retryJson = null;
        }

        if (retryJson && Array.isArray(retryJson.experiences)) {
          const retryByIndex = {};
          retryJson.experiences.forEach((exp) => {
            if (!exp || typeof exp !== 'object') return;
            const idx =
              typeof exp.index === 'number'
                ? exp.index
                : parseInt(String(exp.index ?? ''), 10);
            const desc = typeof exp.description === 'string' ? exp.description.trim() : '';
            if (Number.isNaN(idx) || idx === null) return;
            if (!desc) return;
            retryByIndex[String(idx)] = desc;
          });

          const stillMissing = [];
          for (let i = 0; i < originalExperiencesCount; i++) {
            if (!retryByIndex[String(i)]) stillMissing.push(i);
          }

          if (stillMissing.length === 0) {
            validatedPatch.experiences = Array.from({ length: originalExperiencesCount }, (_, i) => ({
              index: i,
              description: retryByIndex[String(i)]
            }));
            console.log('[Generators] ✅ Experiences-only retry succeeded; all descriptions rephrased.');
          } else {
            console.warn('[Generators] ⚠️ Experiences-only retry still missing indices:', stillMissing);
          }
        } else {
          console.warn('[Generators] ⚠️ Experiences-only retry returned invalid shape; keeping fallback experiences.');
        }
      } catch (retryError) {
        console.warn('[Generators] ⚠️ Experiences-only retry failed; keeping fallback experiences:', retryError?.message || retryError);
      }
    }

    // Final validation: ensure we never return completely empty data
    if (!validatedPatch.summary || validatedPatch.summary.trim().length === 0) {
      console.error('[Generators] ❌ CRITICAL: Summary is still empty after all fallbacks!');
      validatedPatch.summary = 'Professional with relevant experience and skills.';
    }
    if (validatedPatch.skills.length === 0) {
      console.error('[Generators] ❌ CRITICAL: Skills array is still empty after all fallbacks!');
      validatedPatch.skills = ['Professional Skills'];
    }

    console.log('[Generators] ✅ Tailored CV generated and validated:', {
      hasSummary: !!validatedPatch.summary,
      summaryLength: validatedPatch.summary.length,
      hasFocusSummary: !!validatedPatch.focus_summary,
      skillsCount: validatedPatch.skills.length,
      highlightsCount: validatedPatch.highlights.length,
      experiencesCount: validatedPatch.experiences.length,
      summaryPreview: validatedPatch.summary.substring(0, 100) + (validatedPatch.summary.length > 100 ? '...' : '')
    });

    // Log full data structure for debugging
    console.log('[Generators] 📊 Full tailored patch structure:', JSON.stringify(validatedPatch, null, 2));

    return { patch: validatedPatch, usage: result.usage };
  } catch (error) {
    console.error('[Generators] ❌ Error generating tailored CV:', error);
    console.error('[Generators] ❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Return fallback stub content instead of throwing
    if (error.message && error.message.includes('API key not configured')) {
      throw error; // Re-throw configuration errors
    }
    
    console.warn('[Generators] ⚠️ Returning fallback CV data due to error');
    
    // Build comprehensive fallback using original CV data
    const originalSummary = cvData.user?.summary || '';
    const originalSkills = cvData.user?.skills || [];
    const originalExperiences = cvData.workExperiences || [];
    
    // Ensure summary is never empty
    let fallbackSummary = originalSummary;
    if (!fallbackSummary || fallbackSummary.trim().length === 0) {
      // Never fabricate years/metrics in fallback copy.
      const skillsText =
        originalSkills.length > 0 ? originalSkills.slice(0, 5).join(', ') : 'relevant skills';
      const rolesText =
        originalExperiences.length > 0 ? `${originalExperiences.length} role(s)` : 'professional roles';
      fallbackSummary = `Professional with experience across ${rolesText} and skills in ${skillsText}.`;
      console.log('[Generators] ⚠️ Created non-fabricated fallback summary from available data');
    }
    
    // Ensure skills is never empty
    let fallbackSkills = originalSkills.length > 0 ? [...originalSkills] : ['Professional Skills'];
    
    // Create highlights from experiences if available
    let fallbackHighlights = [];
    if (originalExperiences.length > 0) {
      fallbackHighlights = originalExperiences
        .slice(0, 5)
        .filter(exp => exp.description && exp.description.trim().length > 0)
        .map((exp, idx) => ({
          text: exp.description.substring(0, 150) + (exp.description.length > 150 ? '...' : ''),
          source: 'experience',
          index: idx
        }));
    }
    
    // Create experiences array from original work experiences
    let fallbackExperiences = [];
    if (originalExperiences.length > 0) {
      fallbackExperiences = originalExperiences.map((exp, idx) => ({
        index: idx,
        description: exp.description || `${exp.position || 'Position'} at ${exp.company || 'Company'}`
      }));
    }
    
    const fallbackData = {
      summary: fallbackSummary,
      focus_summary: null,
      skills: fallbackSkills,
      highlights: fallbackHighlights,
      experiences: fallbackExperiences
    };
    
    console.log('[Generators] ⚠️ Fallback data:', {
      hasSummary: !!fallbackData.summary,
      summaryLength: fallbackData.summary.length,
      skillsCount: fallbackData.skills.length,
      highlightsCount: fallbackData.highlights.length,
      experiencesCount: fallbackData.experiences.length
    });
    
    return { 
      patch: fallbackData, 
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0 } 
    };
  }
}

/**
 * Build comprehensive CV tailoring prompt
 */
function buildCVTailoringPrompt(cvData, jobData, userInstructions, focusLabel) {
  const safeJob = jobData?.jobInfo ? jobData.jobInfo : (jobData || {});
  const safeCompany = jobData?.companyInfo ? jobData.companyInfo : {};

  const jobTitle = safeJob.title ?? jobData?.title ?? '';
  const jobLocation = safeJob.location ?? jobData?.location ?? '';
  const experienceLevel = safeJob.experienceLevel ?? jobData?.experienceLevel ?? '';
  const jobDescription = safeJob.description ?? jobData?.description ?? '';
  const jobFunctionsRaw = safeJob.jobFunctions ?? jobData?.jobFunctions ?? [];
  const industriesRaw = safeJob.industries ?? jobData?.industries ?? [];
  const companyInfo = {
    name: safeCompany.name ?? safeJob.company ?? jobData?.company ?? '',
  };

  const user = cvData?.user || {};
  const experiences = Array.isArray(cvData?.workExperiences) ? cvData.workExperiences : [];
  const projects = Array.isArray(cvData?.projects) ? cvData.projects : [];

  const yearOrNA = (v) => {
    if (!v) return 'N/A';
    if (v instanceof Date && !Number.isNaN(v.getTime())) return String(v.getFullYear());
    const d = new Date(String(v));
    if (!Number.isNaN(d.getTime())) return String(d.getFullYear());
    const s = String(v);
    const m = s.match(/\b(19|20)\d{2}\b/);
    return m ? m[0] : 'N/A';
  };

  const experiencesText = experiences
    .map((exp, idx) => {
      const startYear = yearOrNA(exp?.startDate);
      const endYear = exp?.endDate ? yearOrNA(exp.endDate) : 'Present';
      return (
        `Experience ${idx}:\n` +
        `  Position: ${exp?.position || 'N/A'}\n` +
        `  Company: ${exp?.company || 'N/A'}\n` +
        `  Dates: ${startYear}-${endYear}\n` +
        `  Description: ${exp?.description ?? 'No description'}\n`
      );
    })
    .join('\n');

  const projectsText = projects
    .map((proj, idx) => {
      const techs = Array.isArray(proj?.technologies) ? proj.technologies.join(', ') : '';
      return (
        `Project ${idx}:\n` +
        `  Name: ${proj?.name || 'N/A'}\n` +
        `  Description: ${proj?.description ?? 'No description'}\n` +
        `  Technologies: ${techs}\n`
      );
    })
    .join('\n');

  const skillsText = Array.isArray(user?.skills) ? user.skills.join(', ') : '';

  // Flutter-style SOURCE OF TRUTH JSON
  const cvJson = {
    user: {
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      headline: user?.headline ?? '',
      summary: user?.summary ?? '',
      location: user?.location ?? '',
      linkedin: user?.linkedin ?? '',
      skills: Array.isArray(user?.skills) ? user.skills : [],
    },
    workExperiences: experiences.map((e) => ({
      company: e?.company ?? '',
      position: e?.position ?? '',
      startDate: e?.startDate ?? '',
      endDate: e?.endDate ?? '',
      current: !!e?.current,
      description: e?.description ?? '',
    })),
    projects: projects.map((p) => ({
      name: p?.name ?? '',
      description: p?.description ?? '',
      technologies: Array.isArray(p?.technologies) ? p.technologies : [],
    })),
  };

  const jobFunctions =
    Array.isArray(jobFunctionsRaw) ? jobFunctionsRaw.join(', ') : String(jobFunctionsRaw ?? '');
  const industries =
    Array.isArray(industriesRaw) ? industriesRaw.join(', ') : String(industriesRaw ?? '');

  const buffer = [];
  buffer.push(
    'You are a professional CV tailoring expert. Your PRIMARY GOAL is to MAXIMIZE the job match percentage by making AGGRESSIVE, SIGNIFICANT improvements.'
  );
  buffer.push('');
  buffer.push('CRITICAL RULES:');
  buffer.push('1. NEVER add information that is not present in the original CV data');
  buffer.push('2. ONLY rephrase, prioritize, and select from existing information');
  buffer.push('3. Use synonyms and keywords from the job description intelligently');
  buffer.push('4. Focus on aspects most relevant to the job requirements');
  buffer.push('5. ABSOLUTE HONESTY: Do NOT fabricate years of experience, numbers/metrics, tools, responsibilities, or achievements');
  buffer.push('6. Metrics rule: You may ONLY mention a metric/number if it already exists verbatim in USER_CV_JSON');
  buffer.push(
    '7. Skills rule: Do NOT invent new skills. You may ONLY use/reorder skills that already exist in USER_CV_JSON (user.skills, project technologies, or terms already present in descriptions).'
  );
  buffer.push('');
  buffer.push('AGGRESSIVE IMPROVEMENT STRATEGY:');
  buffer.push(
    '1. Summary: Completely rephrase to include 5-10 keywords/phrases from the job description. Use powerful action verbs (spearheaded, optimized, transformed, delivered).'
  );
  buffer.push(
    '2. Skills: Reorder to prioritize job-matching skills FIRST. Extract skills from experience/project descriptions if they match job requirements (e.g., if job needs "Agile" and CV mentions "sprint planning", include "Agile" in skills).'
  );
  buffer.push(
    '3. Experiences: Rephrase EVERY experience description to emphasize job-relevant aspects. Use impact statements and job keywords. ONLY include metrics if they already exist in the original description.'
  );
  buffer.push(
    '4. Highlights: Select the 3-5 MOST relevant achievements that directly align with job requirements.'
  );
  buffer.push(
    '5. Use synonyms intelligently: "led" → "spearheaded", "improved" → "optimized", "worked on" → "delivered", "helped" → "collaborated to achieve"'
  );
  buffer.push('');
  buffer.push('EXPERIENCE DESCRIPTIONS - CRITICAL:');
  buffer.push('- You MUST return an "experiences" array with a rephrased description for EVERY work experience (one per index)');
  buffer.push('- NEVER fabricate or add responsibilities/achievements that are not present in the original description');
  buffer.push('- Keep companies/roles/dates the same; ONLY rewrite the wording to better match the job');
  buffer.push('- Output item format: {"index": N, "description": "rephrased description"}');

  if (focusLabel != null && String(focusLabel).trim().length > 0) {
    const cleaned = String(focusLabel).trim();
    buffer.push('');
    buffer.push('FOCUS TAG (HIGHEST PRIORITY):');
    buffer.push(`"${cleaned}"`);
    buffer.push('');
    buffer.push(
      'CRITICAL: You MUST emphasize this focus throughout the CV (summary, skills ordering, highlights, and experience descriptions).'
    );
    buffer.push(
      'This focus tag is a condensed user intent and should guide what you emphasize.'
    );
    buffer.push('');
  }

  if (userInstructions != null && String(userInstructions).trim().length > 0) {
    const instr = String(userInstructions);
    buffer.push('');
    buffer.push('USER CUSTOM INSTRUCTIONS (HIGH PRIORITY):');
    buffer.push(`"${instr}"`);
    buffer.push('');
    buffer.push('CRITICAL: You MUST follow these instructions precisely:');
    buffer.push(
      '- If instruction says "اختصر" (summarize) or "باختصار" (briefly), make descriptions more concise and to the point'
    );
    buffer.push(
      '- If instruction mentions focusing on something (e.g., "ركز على القيادة"), emphasize that aspect throughout the CV'
    );
    buffer.push(
      '- If instruction says "اذكر" (mention) or "طالب" (student), ensure it\'s clearly included in the CV'
    );
    buffer.push(
      '- If instruction asks to highlight specific skills or experiences, prioritize them in the summary and highlights'
    );
    buffer.push(
      '- Apply these instructions throughout the CV tailoring process - summary, skills, experiences, and highlights'
    );
    buffer.push(
      '- The user\'s custom instructions take precedence over general job matching when they conflict'
    );
    buffer.push('');
  }

  buffer.push('');
  buffer.push('JOB INFORMATION:');
  buffer.push(`Title: ${jobTitle}`);
  buffer.push(`Company: ${companyInfo.name}`);
  buffer.push(`Location: ${jobLocation}`);
  buffer.push(`Experience Level: ${experienceLevel}`);
  if (jobFunctions.trim().length > 0) buffer.push(`Job Functions: ${jobFunctions}`);
  if (industries.trim().length > 0) buffer.push(`Industries: ${industries}`);
  buffer.push('');
  buffer.push('Job Description:');
  buffer.push(jobDescription);
  buffer.push('');

  buffer.push('USER CV DATA:');
  buffer.push(`Full Name: ${user?.fullName ?? ''}`);
  buffer.push(`Headline: ${user?.headline ?? 'N/A'}`);
  buffer.push(`Summary: ${user?.summary ?? 'N/A'}`);
  buffer.push(`Skills: ${skillsText}`);
  buffer.push('');
  buffer.push('Work Experiences:');
  buffer.push(experiencesText);
  buffer.push('');
  buffer.push('Projects:');
  buffer.push(projectsText);
  buffer.push('');

  buffer.push('USER_CV_JSON (SOURCE OF TRUTH):');
  buffer.push(JSON.stringify(cvJson));
  buffer.push('');

  buffer.push('TASK:');
  buffer.push('Return a JSON object with the following structure:');
  buffer.push('{');
  buffer.push(
    '  "summary": "Rephrased professional summary (2-4 sentences) focusing on job requirements and user instructions",'
  );
  buffer.push(
    '  "focus_summary": "A very short (1-3 words) label summarizing the user instructions. If a FOCUS TAG was provided, return EXACTLY that tag (no prefixes). Return null if no user instructions/focus tag provided.",'
  );
  buffer.push(
    '  "skills": ["Prioritized", "list", "of", "skills", "matching", "job", "requirements"],'
  );
  buffer.push('  "highlights": [');
  buffer.push(
    '    {"text": "Rephrased achievement 1", "source": "experience|project", "index": 0},'
  );
  buffer.push(
    '    {"text": "Rephrased achievement 2", "source": "experience|project", "index": 1}'
  );
  buffer.push('  ],');
  buffer.push('  "experiences": [');
  buffer.push(
    '    {"index": 0, "description": "Enhanced description focusing on relevant aspects"},'
  );
  buffer.push('    {"index": 1, "description": "Enhanced description..."}');
  buffer.push('  ]');
  buffer.push('}');
  buffer.push('');
  buffer.push('Guidelines:');
  buffer.push('- Select 3-5 most relevant highlights from experiences and projects');
  buffer.push('- Rephrase descriptions AGGRESSIVELY to use keywords from job description');
  buffer.push('- Prioritize skills that match job requirements (reorder AND extract from descriptions)');
  buffer.push('- Keep all factual information accurate (companies, dates, positions)');
  buffer.push('- If user instructions provided, emphasize those aspects throughout');
  buffer.push('- If a FOCUS TAG is provided, prioritize it and set focus_summary to exactly that tag (1-3 words, no prefixes)');
  buffer.push('- Skills can be extracted from experience descriptions, project descriptions, or summary text if they match job requirements');
  buffer.push('- Example: If job requires "Project Management" and CV mentions "managed cross-functional teams" in experience, include "Project Management" in skills');
  buffer.push('- Make improvements SIGNIFICANT enough to increase match percentage by 10-20%');

  return buffer.join('\n');
}
