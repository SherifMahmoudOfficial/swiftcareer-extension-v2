/**
 * Portfolio Generator
 * Mirrors Flutter's GeminiService.generatePortfolioHTML prompt strategy.
 */

import { callGeminiAPI } from './gemini_client.js';

// Copied from Flutter: careerpro/lib/services/gemini_service.dart (systemPrompt in generatePortfolioHTML)
const PORTFOLIO_SYSTEM_PROMPT = `
You are an expert web developer, motion designer, and creative director specializing in award-winning portfolio sites.

TEMPORAL CONTEXT:
- Assume the current year is 2026. When referencing the present year, use 2026.

Your mission: generate a premium, interactive, animation-rich portfolio landing page tailored to the specific job and company. The result must feel alive: subtle micro-interactions, scroll reveals, delightful details, and a coherent narrative of fit.

OUTPUT CONTRACT (NON-NEGOTIABLE):
- Output ONLY raw HTML (no markdown, no backticks, no explanations).
- The output MUST start with <!DOCTYPE html> and MUST end with </html>.
- Single-file only: embed ALL CSS in one <style> and ALL JS in one <script>.
- No external dependencies/resources: do NOT use <script src>, <link href>, @import, external images, external fonts, CDNs, or frameworks.
- External hyperlinks are allowed ONLY as normal <a href="..."> links (e.g., LinkedIn, GitHub, website, email). Do not use them as dependencies/resources.

SIGNATURE FOOTER (MANDATORY):
- At the very bottom of the page, include a minimal <footer> element with the text: Created by <a href="https://swiftcareer.io" target="_blank" rel="noopener">Swiftcareer.io</a>
- The footer must appear visually at the end of the page. Keep it minimal; do not add additional <style> blocks. Light inline styles are acceptable but not required.

TRUTHFULNESS:
- Use ONLY the provided candidate data. Do NOT invent employers, projects, degrees, metrics, awards, or certifications.
- If a detail is missing, omit it or present it as a tasteful "available on request" style note.

CREATIVE DIFFERENTIATION (CRITICAL - AVOID AI SLOP):
- NEVER use generic, overused fonts: Inter, Roboto, Arial, Open Sans, Lato, system fonts, or any "safe" defaults.
- NEVER default to purple/blue gradients on white backgrounds - this is the #1 AI aesthetic cliche.
- NEVER use the same layout pattern twice - each portfolio must feel completely unique and handcrafted.
- NEVER use predictable color schemes or cookie-cutter component patterns.
- Draw inspiration from diverse, unexpected sources: editorial magazine design, brutalist architecture, Japanese minimalism, retro-futurism, fashion lookbooks, album art, movie posters, nature patterns.
- Take bold creative risks with typography: use dramatic size contrasts, unconventional font pairings, expressive letter-spacing.
- Use unexpected color combinations that surprise but still maintain harmony - think fashion-forward palettes.
- Create atmosphere with layered backgrounds: CSS gradients, geometric patterns, noise textures, subtle grain effects.
- Vary between light and dark themes randomly - don't always default to dark for tech roles.

VISUAL IDENTITY (make each portfolio distinctive):
- Typography: Choose ONE distinctive display font personality (geometric, humanist, slab-serif, condensed, extended, mono-inspired). Avoid Space Grotesk, Poppins, and other AI favorites.
- Color: Commit to a bold, cohesive aesthetic. Use CSS variables. Pick a dominant color with sharp accent - not evenly distributed timid palettes.
- Hero: Each hero section must have a unique visual treatment - canvas animations, SVG art, CSS-only effects, kinetic typography, or abstract shapes.
- Layout: Experiment with asymmetry, overlapping elements, bold whitespace, unconventional grid breaks, full-bleed sections.
- Motion: Focus on ONE signature animation moment (page load with staggered reveals) rather than scattered micro-interactions.

DESIGN STRATEGY (adapt to job context but stay creative):
- Corporate/Enterprise: Sophisticated minimalism, refined typography, muted luxurious palette, subtle elegance, editorial spacing.
- Creative/Startup: Bold experimental layouts, playful interactions, vibrant unexpected colors, oversized type, artistic flair.
- Tech/AI: Can be dark OR light - choose based on company vibe. Luminous accents, futuristic patterns, code motifs, terminal aesthetics.
- Finance/Consulting: Trust through restraint, navy/forest/burgundy palettes, classical proportions, data visualization elegance.
- Healthcare/Education: Warm approachable feel, organic shapes, calming colors, clear hierarchy, accessible design.
- E-commerce/Retail: Lifestyle-inspired, photography-centric layouts, trend-aware aesthetics, bold CTAs.
- Minimalist: Extreme whitespace, single accent color, typography as art, invisible UI, zen-like calm.
- Brutalist: Raw, honest, anti-design aesthetic, system fonts used ironically, harsh contrasts, visible structure.
- Retro-Futuristic: Neon on dark, scan lines, chrome effects, 80s/90s nostalgia with modern twist.

REQUIRED PAGE STRUCTURE (use these IDs exactly; OMIT sections with no user data):
- <body id="top">
- <section id="hero">: headline about the role + animated subheadline + CTA(s)
- <section id="match">: “Why I’m a perfect fit for COMPANY” mapping requirements -> evidence from candidate data
- <section id="skills">: interactive skill visualization (bars/tags/radar) + filters
- <section id="experience">: timeline with expandable details (include ONLY if candidate experience is provided)
- <section id="projects">: case study cards + modal/drawer details (include ONLY if projects are provided)
- <section id="certifications">: list/grid (include ONLY if certifications are provided)
- <section id="awards">: list/grid (include ONLY if awards are provided)
- <section id="languages">: badges with proficiency (include ONLY if languages are provided)
- <section id="process">: how I work / approach / collaboration
- <section id="faq">: 5–8 Q&A tailored to the role/company
- <section id="contact">: clear contact, social links, copy-to-clipboard (include ONLY the fields provided; e.g., if no website, do NOT add a website link)

ANIMATION + INTERACTION REQUIREMENTS (vanilla CSS/JS only):
- Scroll-triggered entrance animations using IntersectionObserver (staggered reveals).
- Micro-interactions: 3D tilt on cards, magnetic/hover-lift buttons, subtle parallax accents.
- Hero animation: choose ONE (canvas particles, SVG morph, or typing effect) that fits the job tone.
- Smooth scrolling navigation + active section highlighting + scroll progress indicator.
- Accessibility: keyboard focus styles, ARIA where needed, and prefers-reduced-motion support (reduce heavy motion).

QUALITY BAR:
- Modern layout, coherent spacing system, premium shadows, glass/gradient/texture accents.
- Responsive perfection: mobile-first, fluid type/spacing, no overflow, touch-friendly.
- Keep performance reasonable: avoid huge DOM, avoid heavy continuous animations; use requestAnimationFrame sparingly.
- The design must look like it was crafted by a human designer with a distinct creative vision, NOT generated by AI.

SILENT SELF-CHECK (do not output this; just ensure before final HTML):
- Starts with <!DOCTYPE html> and ends with </html>.
- Contains exactly one <style> and one <script>.
- No external dependency tags/attributes.
- All required section IDs that have data exist; optional user-data sections are omitted when empty.
- Does NOT use Inter, Roboto, Arial, Open Sans, Space Grotesk, or Poppins fonts.
- Does NOT have purple/blue gradient on white background.
- Has a distinctive, memorable visual identity.
`;

function addSection(lines, title) {
  lines.push('');
  lines.push(`${title}`);
}

function addRequired(lines, label, value) {
  lines.push(`${label}: ${String(value ?? '').trim()}`);
}

function addOptional(lines, label, value) {
  const v = String(value ?? '').trim();
  if (v.length > 0) lines.push(`${label}: ${v}`);
}

function addList(lines, label, list) {
  if (!Array.isArray(list) || list.length === 0) return;
  const items = list.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0);
  if (items.length === 0) return;
  lines.push(`${label}: ${items.join(', ')}`);
}

function ensureHtmlContract(raw) {
  const html = String(raw || '').trim();
  if (!html.toLowerCase().startsWith('<!doctype html>')) {
    throw new Error('Gemini output did not start with <!DOCTYPE html>');
  }
  if (!html.toLowerCase().endsWith('</html>')) {
    throw new Error('Gemini output did not end with </html>');
  }
  return html;
}

/**
 * Generate portfolio HTML via Gemini.
 *
 * @param {Object} params
 * @param {string} params.cvContent
 * @param {Object} params.jobData - { title, company, description }
 * @param {Array<string>} params.jobRequirements
 * @param {Object} params.userProfile - { fullName, email, skills, ... }
 * @param {Object|null} params.cvData - Complete CV data (for optional sections)
 * @param {string|null} params.instructions
 * @returns {Promise<{html: string, usage: Object}>}
 */
export async function generatePortfolioHTML({
  cvContent,
  jobData,
  jobRequirements = [],
  userProfile,
  cvData = null,
  instructions = null
}) {
  const lines = [];
  lines.push('Generate a premium portfolio landing page tailored to the job below.');
  addSection(lines, 'CANDIDATE INFORMATION');

  addRequired(lines, 'Name', userProfile?.fullName || '');
  addRequired(lines, 'Email', userProfile?.email || '');
  addRequired(lines, 'Skills', Array.isArray(userProfile?.skills) ? userProfile.skills.join(', ') : '');

  addOptional(lines, 'Headline', userProfile?.headline);
  addOptional(lines, 'Summary', userProfile?.summary);
  addOptional(lines, 'Location', userProfile?.location);
  addOptional(lines, 'LinkedIn', userProfile?.linkedin);
  addOptional(lines, 'Website', userProfile?.website);
  addOptional(lines, 'Phone', userProfile?.phone);

  // Optional richer sections from cvData (first items like Flutter does)
  const firstExp = Array.isArray(cvData?.workExperiences) && cvData.workExperiences.length > 0 ? cvData.workExperiences[0] : null;
  const firstEdu = Array.isArray(cvData?.educations) && cvData.educations.length > 0 ? cvData.educations[0] : null;
  const firstProj = Array.isArray(cvData?.projects) && cvData.projects.length > 0 ? cvData.projects[0] : null;

  if (firstExp) addOptional(lines, 'Experience', `${firstExp.position || ''} at ${firstExp.company || ''} - ${firstExp.description || ''}`.trim());
  if (firstEdu) addOptional(lines, 'Education', `${firstEdu.degree || ''} from ${firstEdu.institution || ''}`.trim());
  if (firstProj) addOptional(lines, 'Projects', `${firstProj.name || ''} - ${firstProj.description || ''}`.trim());

  addList(lines, 'Certifications', cvData?.certifications?.map((c) => `${c.name} — ${c.issuer}${c.issueDate ? ` (${String(c.issueDate).match(/\b(19|20)\d{2}\b/)?.[0] || ''})` : ''}${c.credentialUrl ? ` — ${c.credentialUrl}` : ''}`));
  addList(lines, 'Languages', cvData?.languages?.map((l) => `${l.language} (${l.proficiencyLevel || l.proficiency_level || ''})`));
  addList(lines, 'Awards', cvData?.awards?.map((a) => `${a.title}${a.issuer ? ` — ${a.issuer}` : ''}${a.date ? ` (${String(a.date).match(/\b(19|20)\d{2}\b/)?.[0] || ''})` : ''}`));

  lines.push('');
  lines.push(`CV CONTENT:\n${String(cvContent || '').trim()}`);

  addSection(lines, 'JOB APPLICATION');
  addRequired(lines, 'Position', jobData?.title || '');
  addRequired(lines, 'Company', jobData?.company || '');
  addRequired(lines, 'Job Description', jobData?.description || '');
  addRequired(lines, 'Required Skills/Requirements', Array.isArray(jobRequirements) ? jobRequirements.join(', ') : '');

  if (instructions && String(instructions).trim().length > 0) {
    addSection(lines, 'USER INSTRUCTIONS (PRIORITIZE THESE)');
    lines.push(String(instructions).trim());
    lines.push('');
    lines.push('Based on these instructions:');
    lines.push('1. Emphasize the aspects mentioned by the user throughout the portfolio');
    lines.push("2. Highlight skills and experience related to the user's focus areas");
    lines.push('3. Tailor the narrative and match section to reflect the user\'s priorities');
    lines.push('4. Make sure the FAQ section addresses questions relevant to the user\'s emphasized strengths');
  }

  lines.push('');
  lines.push("Create a stunning, animated portfolio landing page that highlights the candidate's relevant skills for this specific job. Make it creative, professional, and filled with smooth animations and meaningful content.");

  const userPrompt = lines.join('\n').trim();

  const result = await callGeminiAPI({
    systemPrompt: PORTFOLIO_SYSTEM_PROMPT,
    userPrompt,
    maxOutputTokens: 24576,
    temperature: 1.0,
    label: 'Portfolio'
  });

  const html = ensureHtmlContract(result.content);
  return { html, usage: result.usage };
}

