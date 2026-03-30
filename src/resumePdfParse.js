import * as pdfjs from 'pdfjs-dist';
import { isEmbeddedJobHeaderLine, parseEmbeddedJobHeader } from './experienceDetailSegments';

let workerConfigured = false;

/**
 * Load the worker from the same origin as the app (public/pdf.worker.min.mjs).
 * A remote CDN worker often hangs or fails when offline, behind corporate proxies, or under strict CSP.
 */
function ensurePdfWorker() {
  if (workerConfigured || typeof window === 'undefined') return;
  const pub = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const path = `${pub}/pdf.worker.min.mjs`.replace(/\/+/g, '/');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(path, window.location.origin).href;
  workerConfigured = true;
}

const EMAIL_RE = /[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const URL_LIKE = /^(https?:\/\/|www\.)/i;

/** Letters including Latin extended, accents, CJK, etc. */
function looksLikePersonName(line) {
  const t = String(line).trim();
  if (t.length < 2 || t.length > 70) return false;
  if (EMAIL_RE.test(t) || URL_LIKE.test(t)) return false;
  if (/^\d[\d\s./-]+$/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;
  if (!/^[\p{L}\p{M}\s.'’-]+$/u.test(t)) return false;
  return words.every((w) => /^[\p{L}\p{M}]+(?:[.'’-][\p{L}\p{M}]+)*$/u.test(w));
}

/** Group text items into lines by Y position (keeps Unicode from the PDF). */
function pageItemsToLines(textContent, yTolerance = 4) {
  const items = textContent.items
    .filter((it) => it.str && String(it.str).trim())
    .map((it) => ({
      str: String(it.str),
      x: it.transform[4],
      y: it.transform[5],
    }));
  if (!items.length) return [];
  items.sort((a, b) => (Math.abs(a.y - b.y) <= yTolerance ? a.x - b.x : b.y - a.y));
  const lines = [];
  let bucket = [items[0]];
  let refY = items[0].y;
  for (let i = 1; i < items.length; i++) {
    const it = items[i];
    if (Math.abs(it.y - refY) <= yTolerance) {
      bucket.push(it);
    } else {
      lines.push(
        bucket
          .sort((a, b) => a.x - b.x)
          .map((b) => b.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
      bucket = [it];
      refY = it.y;
    }
  }
  if (bucket.length) {
    lines.push(
      bucket
        .sort((a, b) => a.x - b.x)
        .map((b) => b.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }
  return lines;
}

function isBulletStartLine(s) {
  return /^[\u2022•▪*-]\s*\S/.test(String(s).trim());
}

/** Short ALL-CAPS line (section title); don't glue to the next line. */
function isLikelySectionTitleLine(s) {
  const t = String(s).trim();
  if (t.length < 4 || t.length > 52) return false;
  if (!/^[A-Z0-9][A-Z0-9\s/&]+$/u.test(t)) return false;
  return t === t.toUpperCase();
}

function looksLikePipeJobHeaderLine(line) {
  const t = line.trim();
  if (!t || isBulletStartLine(t)) return false;
  return t.includes('|') && /\b(19|20)\d{2}\b/.test(t);
}

/**
 * Join PDF lines that are hard-wrapped in the middle of a sentence or bullet
 * (e.g. "• Created ... high" + "data integrity for" → one row).
 */
function reflowHardWrappedPdfLines(text) {
  if (!text || typeof text !== 'string') return text;
  const rawLines = text.split(/\r?\n/);
  const merged = [];
  let acc = '';

  const flush = () => {
    if (acc) {
      merged.push(acc);
      acc = '';
    }
  };

  const endsSentence = (s) => /[.!?]["'”’]?\s*$/.test(s.trim());

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const t = line.trim();

    if (t === '') {
      flush();
      merged.push('');
      continue;
    }

    if (!acc) {
      acc = t;
      continue;
    }

    if (isBulletStartLine(t)) {
      flush();
      acc = t;
      continue;
    }
    if (isLikelySectionTitleLine(t)) {
      flush();
      acc = t;
      continue;
    }
    if (looksLikePipeJobHeaderLine(t)) {
      flush();
      acc = t;
      continue;
    }
    if (isLikelySectionTitleLine(acc)) {
      flush();
      acc = t;
      continue;
    }
    if (looksLikePipeJobHeaderLine(acc)) {
      flush();
      acc = t;
      continue;
    }

    if (looksLikePersonName(acc)) {
      flush();
      acc = t;
      continue;
    }

    if (endsSentence(acc)) {
      flush();
      acc = t;
      continue;
    }

    if (/-\s*$/.test(acc)) {
      acc = acc.replace(/-\s*$/, '') + t;
    } else {
      acc = `${acc} ${t}`;
    }
  }
  flush();
  return merged.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Split headers that are glued to the next segment (common in PDF extraction / single-block paste)
 * so `splitIntoSectionLines` and profile contact parsing can identify every field.
 * Example: "| Linkedin Summary Senior…" → Summary section; "Education University…" → Education; "Experience AiRISTA Jan…" → Experience.
 */
export function preprocessResumePlainText(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  let s = raw.replace(/\r\n/g, '\n');

  /* Contact row: "| Linkedin Summary " or "| Summary " before prose */
  s = s.replace(/\s*\|\s*LinkedIn?\s+Summary\s+/gi, '\nSummary\n');
  s = s.replace(/\s*\|\s*Summary\s+(?=[A-Za-z])/g, '\nSummary\n');

  /* "Education University|College|…" */
  s = s.replace(/\bEducation\s+(University|College|School|Institute|Academy)\b/gi, 'Education\n$1');

  /* Trailing "… UK Key skills" / "… GA Key skills" (education glued to skills) */
  s = s.replace(/(\S)\s+(Key\s+skills)\b/gi, '$1\n$2');

  const expJobLookahead =
    '(?=[A-Za-z0-9][A-Za-z0-9&.\'-]*\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{4})';

  /* "Professional Experience COMPANY Mon …" */
  s = s.replace(
    new RegExp(`\\bProfessional\\s+Experience\\s+${expJobLookahead}`, 'gi'),
    'Professional Experience\n',
  );

  /* Line-start "Experience AiRISTA Jan …" */
  s = s.replace(
    new RegExp(`(^|[\\n])\\s*Experience\\s+${expJobLookahead}`, 'gim'),
    '$1Experience\n',
  );

  /* Inline "… Bash Experience AiRISTA Jan …" (skills text glued to first job) */
  s = s.replace(
    new RegExp(`([a-z0-9,;:.)\\]])\\s+Experience\\s+${expJobLookahead}`, 'gi'),
    '$1\nExperience\n',
  );

  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/** pdf.js AnnotationType.LINK — URI links on "LinkedIn" / "GitHub" text, etc. */
const PDF_ANNOT_LINK = 2;

function normalizeAnnotationUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.href.replace(/\/+$/, '') || u.href;
  } catch {
    return s;
  }
}

/**
 * Extract plain text plus LinkedIn/GitHub targets from Link annotations (original PDF hyperlinks).
 * One document load; keeps text path identical to the former extractTextFromPdf loop.
 */
export async function extractTextAndAnnotationLinksFromPdf(arrayBuffer) {
  ensurePdfWorker();
  const data = arrayBuffer instanceof ArrayBuffer ? new Uint8Array(arrayBuffer) : arrayBuffer;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const parts = [];
  const linkedInSeen = new Set();
  const githubSeen = new Set();
  const linkedInUrls = [];
  const githubUrls = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let annotations = [];
    try {
      annotations = await page.getAnnotations();
    } catch {
      annotations = [];
    }
    const lines = pageItemsToLines(content);
    if (lines.length) parts.push(lines.join('\n'));

    for (const a of annotations || []) {
      if (a.annotationType !== PDF_ANNOT_LINK) continue;
      const raw = a.url || a.unsafeUrl;
      if (!raw || typeof raw !== 'string') continue;
      const u = normalizeAnnotationUrl(raw);
      if (!u) continue;
      if (/linkedin\.com/i.test(u) || /lnkd\.in/i.test(u)) {
        if (!linkedInSeen.has(u)) {
          linkedInSeen.add(u);
          linkedInUrls.push(u);
        }
      } else if (/github\.com/i.test(u)) {
        if (!githubSeen.has(u)) {
          githubSeen.add(u);
          githubUrls.push(u);
        }
      }
    }
  }

  const joined = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  const text = reflowHardWrappedPdfLines(joined).trim();
  return {
    text,
    linkedInFromAnnotations: linkedInUrls[0] || '',
    githubFromAnnotations: githubUrls[0] || '',
  };
}

/**
 * Extract plain text from a PDF ArrayBuffer. Preserves letters from many scripts
 * (accents, ligatures, etc.) as returned by pdf.js.
 */
export async function extractTextFromPdf(arrayBuffer) {
  const { text } = await extractTextAndAnnotationLinksFromPdf(arrayBuffer);
  return text;
}

const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d|\(\d{3}\)\s*\d{3}[\s.-]?\d{4})/;

function splitContactLine(line) {
  return line
    .split(/\s*[|·•,]\s*|\s{2,}|\s+—\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickEmail(text) {
  const m = text.match(EMAIL_RE);
  return m ? m[0].trim() : '';
}

function pickPhone(text) {
  const m = text.match(PHONE_RE);
  return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

/**
 * Remove comma-separated social / site labels often merged into location
 * (e.g. "Lilburn, GA, US, 30047, LinkedIn, GitHub, Website").
 */
function sanitizeLocationString(loc) {
  if (!loc || typeof loc !== 'string') return '';
  const parts = loc.split(',').map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p) => {
    const n = p.toLowerCase().replace(/[\s._-]+/g, '');
    if (
      n === 'linkedin' ||
      n === 'github' ||
      n === 'website' ||
      n === 'personalwebsite' ||
      n === 'portfolio' ||
      n === 'twitter' ||
      n === 'facebook' ||
      n === 'instagram' ||
      n === 'blog'
    ) {
      return false;
    }
    return true;
  });
  if (!kept.length) return '';
  return kept.join(', ').replace(/\s+,/g, ',').trim();
}

const HTTP_URL_RE = /https?:\/\/[^\s)\]'"<>|]+/gi;
const LINKEDIN_LOOSE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s)\]'"<>|]+/i;
const GITHUB_LOOSE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s)\]'"<>|]+/i;

/** Same line: "LinkedIn: url", "LinkedIn | url", "GitHub url", etc. */
const LINKEDIN_AFTER_LABEL =
  /\blinkedin\b\s*(?:[:\-|–—]\s*|\s+)((?:https?:\/\/[^\s)\]'"<>|]+)|(?:www\.[^\s)\]'"<>|]+)|(?:linkedin\.com\/[^\s)\]'"<>|]*))/i;
const GITHUB_AFTER_LABEL =
  /\bgithub\b\s*(?:[:\-|–—]\s*|\s+)((?:https?:\/\/[^\s)\]'"<>|]+)|(?:www\.[^\s)\]'"<>|]+)|(?:github\.com\/[^\s)\]'"<>|]*))/i;

function normalizeHttpUrl(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[,;.]+$/g, '');
  if (!/^https?:\/\//i.test(s)) {
    if (/^www\./i.test(s) || /^linkedin\.com/i.test(s) || /^github\.com/i.test(s)) s = `https://${s}`;
  }
  return s;
}

function firstLinkedInFromText(t) {
  const m = LINKEDIN_AFTER_LABEL.exec(t);
  return m && m[1] ? normalizeHttpUrl(m[1]) : '';
}

function firstGithubFromText(t) {
  const m = GITHUB_AFTER_LABEL.exec(t);
  return m && m[1] ? normalizeHttpUrl(m[1]) : '';
}

/** Line is only a label; URL may be on the next line (common in PDF extraction). */
function pickSocialUrlsAdjacentLines(raw) {
  const out = {};
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (let i = 0; i < Math.min(lines.length - 1, 45); i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (/^linkedin\b$/i.test(cur) || /^linkedin\s*:\s*$/i.test(cur)) {
      const http = next.match(HTTP_URL_RE);
      const loose = next.match(LINKEDIN_LOOSE);
      const cand = http?.find((u) => /linkedin\.com/i.test(u)) || loose?.[0];
      if (cand && !out.linkedIn) out.linkedIn = normalizeHttpUrl(cand);
    }
    if (/^github\b$/i.test(cur) || /^github\s*:\s*$/i.test(cur)) {
      const http = next.match(HTTP_URL_RE);
      const loose = next.match(GITHUB_LOOSE);
      const cand = http?.find((u) => /github\.com/i.test(u)) || loose?.[0];
      if (cand && !out.github) out.github = normalizeHttpUrl(cand);
    }
  }
  return out;
}

/** LinkedIn / GitHub URLs: labeled lines first, then domain-based detection. */
function pickSocialUrls(raw) {
  const out = {};
  if (!raw || typeof raw !== 'string') return out;

  for (const line of raw.split(/\r?\n/)) {
    if (!out.linkedIn) {
      const u = firstLinkedInFromText(line);
      if (u) out.linkedIn = u;
    }
    if (!out.github) {
      const u = firstGithubFromText(line);
      if (u) out.github = u;
    }
  }

  const adjacent = pickSocialUrlsAdjacentLines(raw);
  if (!out.linkedIn && adjacent.linkedIn) out.linkedIn = adjacent.linkedIn;
  if (!out.github && adjacent.github) out.github = adjacent.github;

  const found = raw.match(HTTP_URL_RE) || [];
  const normalized = [...new Set(found.map(normalizeHttpUrl).filter(Boolean))];
  for (const u of normalized) {
    if (/linkedin\.com/i.test(u) && !out.linkedIn) out.linkedIn = u;
  }
  for (const u of normalized) {
    if (/github\.com/i.test(u) && !out.github) out.github = u;
  }
  if (!out.linkedIn) {
    const m = raw.match(LINKEDIN_LOOSE);
    if (m) out.linkedIn = normalizeHttpUrl(m[0]);
  }
  if (!out.github) {
    const m = raw.match(GITHUB_LOOSE);
    if (m) out.github = normalizeHttpUrl(m[0]);
  }
  return out;
}

/**
 * Heuristic parse of resume-like plain text into profile fields.
 * Returns only keys that could be inferred (non-empty strings).
 */
export function parseProfileFromResumeText(raw) {
  const out = {};
  if (!raw || typeof raw !== 'string') return out;

  const globalEmail = pickEmail(raw);
  const globalPhone = pickPhone(raw);

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    if (looksLikePersonName(line)) {
      out.fullName = line;
      break;
    }
  }

  if (!out.fullName && lines[0]) {
    const words = lines[0].split(/\s+/).filter(Boolean);
    for (let n = Math.min(words.length, 8); n >= 2; n--) {
      const candidate = words.slice(0, n).join(' ');
      if (looksLikePersonName(candidate)) {
        out.fullName = candidate;
        break;
      }
    }
  }

  if (globalEmail) out.email = globalEmail;
  if (globalPhone) out.phone = globalPhone;

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    const parts = splitContactLine(line);
    if (parts.length < 2) continue;
    const emails = parts.map((p) => pickEmail(p)).filter(Boolean);
    const phones = parts.map((p) => pickPhone(p)).filter(Boolean);
    if (!emails.length && !phones.length) continue;
    // Keep 2-letter tokens (e.g. GA, NY) — they are valid state/country codes after a comma.
    const rest = parts.filter((p) => {
      if (pickEmail(p) || pickPhone(p)) return false;
      const pt = String(p).trim();
      if (/^linkedIn?$/i.test(pt)) return false;
      /* Pipe segment that is actually start of summary / prose */
      if (pt.length > 90) return false;
      return pt.length >= 2;
    });
    if (rest.length && !out.location) {
      const loc = rest.join(', ').replace(/\s+,/g, ',').trim();
      if (loc.length <= 120) out.location = loc;
    }
    break;
  }

  if (!out.location) {
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const line = lines[i];
      if (EMAIL_RE.test(line) || looksLikePersonName(line)) continue;
      if (/^[\p{L}\s,.'\-–—]{4,80}$/u.test(line) && /,/.test(line) && line.length <= 80) {
        out.location = line.trim();
        break;
      }
    }
  }

  if (!out.fullName && lines[0] && lines[0].length < 55 && !EMAIL_RE.test(lines[0]) && !URL_LIKE.test(lines[0])) {
    if (!/^[\u2022•\-*]/.test(lines[0]) && !sectionFromLine(lines[0])) {
      out.fullName = lines[0].trim();
    }
  }

  const social = pickSocialUrls(raw);
  if (social.linkedIn) out.linkedIn = social.linkedIn;
  if (social.github) out.github = social.github;

  if (out.location) {
    const cleaned = sanitizeLocationString(out.location);
    if (cleaned) out.location = cleaned;
    else delete out.location;
  }

  return out;
}

function sectionFromLine(line) {
  const t = line.trim();
  if (!t || t.length > 64) return null;
  const n = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (/^(summary|professional summary|profile|about(\s+me)?|objective|career objective)$/i.test(n)) return 'summary';
  if (
    /^(experience|work experience|employment history|professional experience|work history|employment(\s+history)?)$/i.test(
      n,
    )
  )
    return 'experience';
  if (/^(education|academic background|academic|qualifications)$/i.test(n)) return 'education';
  if (/^(skills|technical skills|core competencies|competencies|key skills)$/i.test(n)) return 'skills';
  if (/^(certifications?|licenses|credentials)$/i.test(n)) return 'certifications';
  if (/^(projects?|personal projects|selected projects|key projects|portfolio)$/i.test(n)) return 'projects';
  return null;
}

function splitIntoSectionLines(raw) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const sections = {
    summary: [],
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
  };
  let current = null;
  const hasMonthYear = (s) => /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(?:19|20)\d{2}\b/i.test(s);

  for (const line of lines) {
    if (!line) continue;
    const sec = sectionFromLine(line);
    if (sec) {
      current = sec;
      continue;
    }

    /* Glued: "Education University of Kent Aug 2009 …" */
    const eduGlued = line.match(/^Education\s+(.+)/i);
    if (eduGlued && eduGlued[1].trim().length > 8) {
      current = 'education';
      sections.education.push(eduGlued[1].trim());
      continue;
    }

    /* Glued: "Summary Senior Software Engineer …" */
    const sumGlued = line.match(/^Summary\s+(.+)/i);
    if (sumGlued && sumGlued[1].trim().length > 3) {
      current = 'summary';
      sections.summary.push(sumGlued[1].trim());
      continue;
    }

    /* Glued: "Experience AiRISTA Jan 2023 …" (require date so we skip "Experience with X" in prose) */
    const exGlued = line.match(/^Experience\s+(.+)/i);
    if (exGlued && hasMonthYear(exGlued[1])) {
      current = 'experience';
      sections.experience.push(exGlued[1].trim());
      continue;
    }
    const profExGlued = line.match(/^Professional\s+Experience\s+(.+)/i);
    if (profExGlued && hasMonthYear(profExGlued[1])) {
      current = 'experience';
      sections.experience.push(profExGlued[1].trim());
      continue;
    }

    if (current) sections[current].push(line);
  }
  return sections;
}

function paragraphBlocks(lines) {
  const blocks = [];
  let cur = [];
  for (const ln of lines) {
    if (!ln) {
      if (cur.length) {
        blocks.push(cur);
        cur = [];
      }
    } else cur.push(ln);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/** Lines like "Acme Corp | Engineer Jan 2020 - Mar 2022" (pipe + year), not bullets. */
function isJobHeaderLine(line) {
  const t = line.trim();
  if (!t || /^[\u2022•\-*▪]/.test(t)) return false;
  if (!t.includes('|')) return false;
  if (!/\b(19|20)\d{2}\b/.test(t)) return false;
  return true;
}

const MONTH_PERIOD_AT_END =
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*[-–—]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\s*$/i;
/** e.g. "May 2025 - Present" (month before a year-range / Present) */
const MONTH_PREFIX_YEAR_PERIOD_AT_END =
  /\b(((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+)?(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|Present|Current|Now))\s*$/i;
const YEAR_PERIOD_AT_END = /\b(\d{4}\s*[-–—]\s*(?:\d{4}|Present|Current|Now))\s*$/i;

/** If period is year-first but title ends with a month name, move month to the period (PDF layout quirk). */
function realignExperienceMonthToPeriod(title, period) {
  let t = (title || '').trim();
  let p = (period || '').trim();
  if (!t || !p) return { title: t, period: p };
  if (!/^(?:19|20)\d{2}\b/i.test(p)) return { title: t, period: p };
  const tm = t.match(/\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?)\s*$/i);
  if (!tm) return { title: t, period: p };
  const mon = tm[1].replace(/\.$/, '');
  t = t.slice(0, tm.index).trim();
  p = `${mon} ${p}`.replace(/\s+/g, ' ').trim();
  return { title: t, period: p };
}

function parsePipeJobLine(line) {
  const parts = line.split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const company = parts[0];
  let rest = parts.slice(1).join(' | ');
  let period = '';
  let m = rest.match(MONTH_PERIOD_AT_END);
  if (!m) m = rest.match(MONTH_PREFIX_YEAR_PERIOD_AT_END);
  if (!m) m = rest.match(YEAR_PERIOD_AT_END);
  let titlePart = rest;
  if (m) {
    period = m[1].replace(/\s+/g, ' ').trim();
    titlePart = rest.slice(0, m.index).trim();
  }
  return { company, title: titlePart, period };
}

function splitExperienceByJobHeaders(lines) {
  const blocks = [];
  let cur = [];
  const flush = () => {
    if (cur.some((l) => l.trim())) blocks.push(cur);
    cur = [];
  };
  for (const ln of lines) {
    if (isJobHeaderLine(ln) || isEmbeddedJobHeaderLine(ln)) {
      if (cur.some((l) => l.trim())) flush();
      cur = [ln];
    } else {
      cur.push(ln);
    }
  }
  flush();
  return blocks;
}

const EDU_MONTH_PERIOD =
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*[-–—]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\s*$/i;

/** Inline span e.g. "Aug 2012 - Dec 2016" (within one line, before degree / city). */
const EDU_MONTH_RANGE_INLINE =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–—]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|Present)\b/i;

const EDU_MON_YEAR_TOKEN =
  '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+(?:19|20)\\d{2}';

/** Split "… Degree text Atlanta, GA" → degree + location for timeline left column. */
function splitDegreeAndTrailingCityState(text) {
  const rest = String(text || '').trim();
  if (!rest) return { degree: '', location: '' };
  const m = rest.match(/\s+([A-Za-z][A-Za-z\s]{0,85}?),\s*([A-Z]{2})\s*$/i);
  if (!m) return { degree: rest, location: '' };
  const location = `${m[1].trim()}, ${m[2].toUpperCase()}`;
  const degree = rest.slice(0, m.index).trim();
  return { degree, location };
}

/**
 * Two-line education e.g. "DeVry University Aug 2012" + "Dec 2016 Bachelors, CIS Atlanta, GA"
 * → school, period "Aug 2012 - Dec 2016", degree, location.
 */
function parseTwoLineMonthYearEducation(lines) {
  const filtered = lines.map((l) => String(l || '').trim()).filter(Boolean);
  if (filtered.length < 2) return null;
  const l1 = filtered[0];
  const l2 = filtered[1];
  const r1 = new RegExp(`^(.+?)\\s+(${EDU_MON_YEAR_TOKEN})\\s*$`, 'i');
  const m1 = l1.match(r1);
  if (!m1) return null;
  const school = m1[1].trim();
  const startMy = m1[2].replace(/\s+/g, ' ');
  const r2 = new RegExp(`^(${EDU_MON_YEAR_TOKEN})\\s+(.+)$`, 'i');
  const m2 = l2.match(r2);
  if (!m2) return null;
  const endMy = m2[1].replace(/\s+/g, ' ');
  const tail = m2[2].trim();
  const { degree, location } = splitDegreeAndTrailingCityState(tail);
  const period = `${startMy} - ${endMy}`;
  const details = filtered.slice(2).join('\n');
  if (!school && !degree) return null;
  return { school, degree, period, location, details };
}

function parseEducationPipeLine(line) {
  const t = line.trim();
  if (!t.includes('|')) return null;
  const parts = t.split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const institution = parts[0];
  let rest = parts.slice(1).join(' | ');
  let period = '';
  const pm = rest.match(EDU_MONTH_PERIOD) || rest.match(YEAR_PERIOD_AT_END);
  if (pm) {
    period = pm[1].replace(/\s+/g, ' ').trim();
    rest = rest.slice(0, pm.index).trim();
  }
  let degree = rest.replace(/,\s*[A-Za-z][a-z]+,\s*[A-Z]{2}\s*$/u, '').trim();
  if (/university|college|institute|academy|\bschool\b/i.test(institution)) {
    return { school: institution, degree, period, details: '' };
  }
  return { school: parts.slice(1).join(' | '), degree: institution, period, details: '' };
}

function blockToExp(block) {
  const filtered = block.filter((l) => l.trim());
  if (!filtered.length) return null;
  const first = filtered[0];
  const restLines = filtered.slice(1);
  if (isJobHeaderLine(first)) {
    const job = parsePipeJobLine(first);
    if (job && (job.title || job.company)) {
      return {
        title: job.title || '',
        company: job.company || '',
        period: job.period || '',
        details: restLines.join('\n'),
      };
    }
  }
  const embeddedHdr = parseEmbeddedJobHeader(first);
  if (embeddedHdr && (embeddedHdr.title || embeddedHdr.company)) {
    return {
      title: embeddedHdr.title || '',
      company: embeddedHdr.company || '',
      period: embeddedHdr.period || '',
      details: restLines.join('\n'),
    };
  }
  const periodInFirst = first.match(
    /\b(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+)?((?:19|20)\d{2}\s*[—–-]\s*(?:(?:19|20)\d{2}|present|current|now))\b/i,
  );
  let title = '';
  let company = '';
  let period = '';
  if (periodInFirst) {
    period = periodInFirst[0].replace(/\s+/g, ' ');
    const before = first.slice(0, periodInFirst.index).trim();
    const at = before.match(/^(.+?)\s+at\s+(.+)$/i);
    const mdash = before.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    if (at) {
      title = at[1].trim();
      company = at[2].trim();
    } else if (mdash) {
      title = mdash[1].trim();
      company = mdash[2].trim();
    } else {
      title = before;
    }
  } else {
    const pipe = first.split(/\s*\|\s*/);
    if (pipe.length >= 2) {
      title = pipe[0].trim();
      company = pipe.slice(1).join(' | ').trim();
    } else if (
      restLines.length &&
      !/^[\u2022•\-*▪]/.test(restLines[0]) &&
      restLines[0].length < 90
    ) {
      title = first;
      company = restLines[0].trim();
      const details = restLines.slice(1).join('\n');
      return { title, company, period: '', details };
    } else {
      title = first;
    }
  }
  const details = restLines.join('\n');
  if (!title && !company && !details) return null;
  return { title, company, period, details };
}

/**
 * One-line education like: "Shanghai Open University 2011 — 2015 Bachelor of ..., major (GPA) City, ST"
 * → school, degree (primary credential only), period "YYYY - YYYY".
 */
function parseDenseEducationLine(line) {
  const t = String(line).trim();
  if (!t || t.includes('|')) return null;

  const mr = EDU_MONTH_RANGE_INLINE.exec(t);
  if (mr && mr.index > 0) {
    const school = t.slice(0, mr.index).trim();
    if (school.length >= 2) {
      const period = mr[0].replace(/\s+/g, ' ');
      const rest = t.slice(mr.index + mr[0].length).trim();
      const { degree: dPart, location } = splitDegreeAndTrailingCityState(rest);
      const degree = dPart || rest;
      return { school, degree, period, location, details: '' };
    }
  }

  const yrEdu =
    /\b((?:19|20)\d{2})\s*[—–-]\s*((?:19|20)\d{2}|Present|Current|Now)\b/i;
  const m = t.match(yrEdu);
  if (!m || m.index === 0) return null;

  const school = t.slice(0, m.index).trim();
  if (school.length < 2) return null;

  const y1 = m[1];
  const y2 = m[2];
  const period = `${y1} - ${y2}`.replace(/\s+/g, ' ');
  let rest = t.slice(m.index + m[0].length).trim();

  if (!rest) {
    return { school, degree: '', period, location: '', details: '' };
  }

  rest = rest.replace(/\([^)]*\bGPA\b[^)]*\)/gi, '').trim();
  rest = rest.replace(/\(\s*GPA\s*:[^)]*\)/gi, '').trim();
  rest = rest.replace(/\s+/g, ' ');

  const degreeLead =
    /\b(bachelor|master|ph\.?\s*d\.?|doctor(?:ate)?|associate|diploma|certificate|undergraduate|graduate|mba|ll\.?m\.?|m\.?\s*d\.?|dds|dvm|msc|bsc|b\.?\s*a\.?|m\.?\s*a\.?|b\.?\s*s\.?|m\.?\s*s\.?|b\.?\s*eng\.?|m\.?\s*eng\.?)\b/i;

  const sp = splitDegreeAndTrailingCityState(rest);
  let location = '';
  let work = rest;
  if (sp.location) {
    location = sp.location;
    work = sp.degree;
  }

  let degree = work;
  if (!location) {
    const commaParts = work.split(',').map((s) => s.trim()).filter(Boolean);
    if (commaParts.length >= 1 && degreeLead.test(commaParts[0])) {
      degree = commaParts[0];
    } else {
      degree = work.split('(')[0].trim();
    }
    degree = degree
      .replace(/,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*$/u, '')
      .replace(/,\s*[A-Z]{2}\s*$/u, '')
      .trim();
  } else {
    degree = work;
  }

  return { school, degree, period, location, details: '' };
}

function blockToEdu(block) {
  const filtered = block.filter((l) => l.trim());
  if (!filtered.length) return null;
  const first = filtered[0];
  if (first.includes('|')) {
    const parsed = parseEducationPipeLine(first);
    if (parsed && (parsed.school || parsed.degree)) {
      const more = filtered.slice(1).join('\n');
      return {
        school: parsed.school || '',
        degree: parsed.degree || '',
        period: parsed.period || '',
        location: '',
        details: more,
      };
    }
  }
  if (filtered.length >= 2) {
    const twoLine = parseTwoLineMonthYearEducation(filtered);
    if (twoLine && (twoLine.school || twoLine.degree)) {
      return {
        school: twoLine.school || '',
        degree: twoLine.degree || '',
        period: twoLine.period || '',
        location: twoLine.location || '',
        details: twoLine.details || '',
      };
    }
  }
  const dense = parseDenseEducationLine(first);
  if (dense && (dense.school || dense.degree)) {
    const more = filtered.slice(1).join('\n');
    return {
      school: dense.school || '',
      degree: dense.degree || '',
      period: dense.period || '',
      location: dense.location || '',
      details: more || dense.details || '',
    };
  }
  const text = filtered.join('\n');
  const periodM = text.match(/\b((?:19|20)\d{2})\s*[—–-]\s*((?:19|20)\d{2})\b/);
  const period = periodM ? periodM[0].replace(/\s+/g, ' ') : '';
  let degree = first;
  let school = '';
  const parts = first.split(/\s*(?:\||,|—|–|-)\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    degree = parts[0];
    school = parts.slice(1).join(', ');
  } else if (filtered[1] && /\d{4}/.test(filtered[1])) {
    degree = first;
    school = '';
  }
  if (!school && filtered[1] && !/\d{4}/.test(filtered[1])) {
    school = filtered[1];
    degree = first;
  }
  return { degree, school, period, location: '', details: '' };
}

function blockToProject(block) {
  const filtered = block.filter((l) => l.trim());
  if (!filtered.length) return null;
  const first = filtered[0];
  const restLines = filtered.slice(1);
  if (isJobHeaderLine(first)) {
    const job = parsePipeJobLine(first);
    if (job && (job.company || job.title || restLines.length)) {
      return {
        name: job.company || '',
        tech: job.title || '',
        period: job.period || '',
        details: restLines.join('\n'),
      };
    }
  }
  let name = first.trim();
  let tech = '';
  let period = '';
  let m =
    first.match(MONTH_PERIOD_AT_END) ||
    first.match(MONTH_PREFIX_YEAR_PERIOD_AT_END) ||
    first.match(YEAR_PERIOD_AT_END);
  if (m) {
    period = m[1].replace(/\s+/g, ' ').trim();
    name = first.slice(0, m.index).trim();
  }
  const pipes = name.split(/\s*\|\s*/);
  if (pipes.length >= 2) {
    name = pipes[0].trim();
    tech = pipes.slice(1).join(' | ').trim();
  }
  const details = restLines.join('\n');
  if (!name && !tech && !details) return null;
  return { name, tech, period, details };
}

/**
 * Full resume-shaped parse: profile, summary, skills, certifications, experience[], education[], projects[].
 * Experience/education rows omit `id` (add in the UI layer).
 */
export function parseResumeFromPdfText(raw) {
  const normalized = preprocessResumePlainText(reflowHardWrappedPdfLines(String(raw || '')));
  const profile = parseProfileFromResumeText(normalized);
  const sec = splitIntoSectionLines(normalized);
  const summary = sec.summary.join('\n').trim();
  const skills = sec.skills.join('\n').trim();
  const certifications = sec.certifications.join('\n').trim();
  const expBlocks = splitExperienceByJobHeaders(sec.experience);
  const experience = expBlocks
    .map(blockToExp)
    .filter((row) => row && (row.title || row.company || row.details))
    .map((row) => {
      const r = realignExperienceMonthToPeriod(row.title, row.period);
      return { ...row, title: r.title, period: r.period };
    });
  const eduBlocks = paragraphBlocks(sec.education);
  const education = eduBlocks
    .map(blockToEdu)
    .filter((row) => row && (row.school || row.degree));
  const projectBlocks = paragraphBlocks(sec.projects);
  const projects = projectBlocks
    .map(blockToProject)
    .filter((row) => row && (row.name || row.tech || row.details));

  return {
    ...profile,
    summary,
    skills,
    certifications,
    experience,
    education,
    projects,
  };
}
