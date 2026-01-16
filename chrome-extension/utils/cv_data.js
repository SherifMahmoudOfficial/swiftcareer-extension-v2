/**
 * CV Data Utilities
 * Fetches complete CV data from database for CV generation
 */

import { getSupabaseClient } from './supabase.js';

/**
 * Get complete CV data for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Complete CV data structure
 */
export async function getCompleteCVData(userId) {
  console.log('[CV Data] 📋 Fetching complete CV data for user:', userId);
  const client = await getSupabaseClient();

  try {
    // Fetch user profile
    const userProfile = await client
      .from('users')
      .select('id, full_name, headline, summary, skills, location, linkedin, email, phone, website')
      .eq('id', userId)
      .single();

    if (!userProfile) {
      throw new Error('User profile not found');
    }

    console.log('[CV Data] ✅ User profile fetched:', {
      fullName: userProfile.full_name,
      skillsCount: userProfile.skills?.length || 0
    });

    // Fetch all related data in parallel
    const [workExperiences, educations, projects, certifications, languages, awards] = await Promise.all([
      fetchWorkExperiences(client, userId),
      fetchEducations(client, userId),
      fetchProjects(client, userId),
      fetchCertifications(client, userId),
      fetchLanguages(client, userId),
      fetchAwards(client, userId)
    ]);

    // Build CV data structure
    const cvData = {
      user: {
        fullName: userProfile.full_name,
        email: userProfile.email,
        headline: userProfile.headline,
        summary: userProfile.summary,
        skills: userProfile.skills || [],
        location: userProfile.location,
        linkedin: userProfile.linkedin,
        phone: userProfile.phone,
        website: userProfile.website
      },
      workExperiences: workExperiences,
      educations: educations,
      projects: projects,
      certifications: certifications,
      languages: languages,
      awards: awards
    };

    console.log('[CV Data] ✅ Complete CV data fetched:', {
      workExperiencesCount: workExperiences.length,
      educationsCount: educations.length,
      projectsCount: projects.length,
      certificationsCount: certifications.length,
      languagesCount: languages.length,
      awardsCount: awards.length
    });

    return cvData;
  } catch (error) {
    console.error('[CV Data] ❌ Error fetching CV data:', error);
    // Return minimal structure instead of throwing
    console.warn('[CV Data] ⚠️ Returning minimal CV data structure');
    return {
      user: {
        fullName: '',
        email: '',
        headline: '',
        summary: '',
        skills: [],
        location: '',
        linkedin: '',
        phone: '',
        website: ''
      },
      workExperiences: [],
      educations: [],
      projects: [],
      certifications: [],
      languages: [],
      awards: []
    };
  }
}

/**
 * Fetch work experiences
 */
async function fetchWorkExperiences(client, userId) {
  try {
    const rows = await client
      .from('work_experiences')
      .select('*')
      .eq('user_id', userId);

    if (!Array.isArray(rows)) {
      console.warn('[CV Data] ⚠️ Work experiences query returned non-array:', typeof rows);
      return [];
    }

    // Sort by start_date descending (newest first) in JavaScript
    const sorted = rows.sort((a, b) => {
      if (!a.start_date && !b.start_date) return 0;
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return new Date(b.start_date) - new Date(a.start_date);
    });

    return sorted.map(exp => ({
      id: exp.id,
      company: exp.company,
      position: exp.position,
      startDate: exp.start_date,
      endDate: exp.end_date,
      current: exp.current,
      description: exp.description
    }));
  } catch (error) {
    console.warn('[CV Data] ⚠️ Error fetching work experiences:', error);
    return [];
  }
}

/**
 * Fetch educations
 */
async function fetchEducations(client, userId) {
  try {
    const rows = await client
      .from('educations')
      .select('*')
      .eq('user_id', userId);

    if (!Array.isArray(rows)) {
      console.warn('[CV Data] ⚠️ Educations query returned non-array:', typeof rows);
      return [];
    }

    // Sort by end_date descending (newest first) in JavaScript
    const sorted = rows.sort((a, b) => {
      if (!a.end_date && !b.end_date) return 0;
      if (!a.end_date) return 1;
      if (!b.end_date) return -1;
      return new Date(b.end_date) - new Date(a.end_date);
    });

    return sorted.map(edu => ({
      id: edu.id,
      institution: edu.institution,
      degree: edu.degree,
      field: edu.field,
      startDate: edu.start_date,
      endDate: edu.end_date,
      gpa: edu.gpa
    }));
  } catch (error) {
    console.warn('[CV Data] ⚠️ Error fetching educations:', error);
    return [];
  }
}

/**
 * Fetch projects
 */
async function fetchProjects(client, userId) {
  try {
    const rows = await client
      .from('projects')
      .select('*')
      .eq('user_id', userId);

    if (!Array.isArray(rows)) {
      console.warn('[CV Data] ⚠️ Projects query returned non-array:', typeof rows);
      return [];
    }

    // Sort by start_date descending (newest first) in JavaScript
    const sorted = rows.sort((a, b) => {
      if (!a.start_date && !b.start_date) return 0;
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return new Date(b.start_date) - new Date(a.start_date);
    });

    return sorted.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description,
      technologies: project.technologies || [],
      url: project.url,
      startDate: project.start_date,
      endDate: project.end_date
    }));
  } catch (error) {
    console.warn('[CV Data] ⚠️ Error fetching projects:', error);
    return [];
  }
}

/**
 * Fetch certifications
 */
async function fetchCertifications(client, userId) {
  try {
    const rows = await client
      .from('certifications')
      .select('*')
      .eq('user_id', userId);

    if (!Array.isArray(rows)) {
      console.warn('[CV Data] ⚠️ Certifications query returned non-array:', typeof rows);
      return [];
    }

    // Sort by issue_date descending (newest first) in JavaScript
    const sorted = rows.sort((a, b) => {
      if (!a.issue_date && !b.issue_date) return 0;
      if (!a.issue_date) return 1;
      if (!b.issue_date) return -1;
      return new Date(b.issue_date) - new Date(a.issue_date);
    });

    return sorted.map(cert => ({
      id: cert.id,
      name: cert.name,
      issuer: cert.issuer,
      issueDate: cert.issue_date,
      expiryDate: cert.expiry_date,
      credentialUrl: cert.credential_url
    }));
  } catch (error) {
    console.warn('[CV Data] ⚠️ Error fetching certifications:', error);
    return [];
  }
}

/**
 * Fetch languages
 */
async function fetchLanguages(client, userId) {
  try {
    const rows = await client
      .from('languages')
      .select('*')
      .eq('user_id', userId);

    if (!Array.isArray(rows)) {
      console.warn('[CV Data] ⚠️ Languages query returned non-array:', typeof rows);
      return [];
    }

    return rows.map(lang => ({
      id: lang.id,
      language: lang.language,
      proficiencyLevel: lang.proficiency_level
    }));
  } catch (error) {
    console.warn('[CV Data] ⚠️ Error fetching languages:', error);
    return [];
  }
}

/**
 * Fetch awards
 */
async function fetchAwards(client, userId) {
  try {
    const rows = await client
      .from('awards')
      .select('*')
      .eq('user_id', userId);

    if (!Array.isArray(rows)) {
      console.warn('[CV Data] ⚠️ Awards query returned non-array:', typeof rows);
      return [];
    }

    // Sort by date descending (newest first) in JavaScript
    const sorted = rows.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date) - new Date(a.date);
    });

    return sorted.map(award => ({
      id: award.id,
      title: award.title,
      issuer: award.issuer,
      date: award.date,
      description: award.description
    }));
  } catch (error) {
    console.warn('[CV Data] ⚠️ Error fetching awards:', error);
    return [];
  }
}
