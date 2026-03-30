/**
 * Detects a second (embedded) job line inside experience "details" text so it is not styled as a bullet.
 * Supports:
 *   - "Lead Developer - JSGuru Aug 2021 - Jul 2025" (title - company, then dates)
 *   - "IBM May 2017 - Jul 2021 Golang/Web Developer II Salt Lake City, UT" (company, then dates, then title)
 */

const MONTH_RANGE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–—]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|Present)\b/i;

const YEAR_RANGE = /\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|Present)\b/i;

const MAX_HEADER_LEN = 240;
const MAX_COMPANY_WORDS = 14;

function stripLeadingBullet(line) {
  return String(line || '').replace(/^\s*[•\-*]\s*/, '').trim();
}

function firstMonthYearRange(s) {
  const re = new RegExp(MONTH_RANGE.source, MONTH_RANGE.flags);
  const m = re.exec(s);
  if (!m) return null;
  return { index: m.index, text: m[0] };
}

function firstYearYearRange(s) {
  const re = new RegExp(YEAR_RANGE.source, YEAR_RANGE.flags);
  const m = re.exec(s);
  if (!m) return null;
  return { index: m.index, text: m[0] };
}

function canCompanyFirstJobHeader(before, after) {
  if (!before || before.length > 90) return false;
  if (!after || after.length < 8) return false;
  const wBefore = before.split(/\s+/).filter(Boolean);
  const wAfter = after.split(/\s+/).filter(Boolean);
  if (wBefore.length > MAX_COMPANY_WORDS) return false;
  /* Job titles are usually several words; avoids "…May 2017 - Jul 2021 release" bullets */
  if (wAfter.length < 3 && after.length < 18) return false;
  return true;
}

/**
 * Split "Role - Company Mon YYYY - Mon YYYY" (or year-only) or "Company Mon YYYY - Mon YYYY Role …".
 * @returns {{ title: string, company: string, period: string } | null}
 */
export function parseEmbeddedJobHeader(text) {
  const s = stripLeadingBullet(text);
  if (!s || s.length < 12) return null;

  const mr = firstMonthYearRange(s);
  if (mr && mr.index > 0) {
    const before = s.slice(0, mr.index).trim();
    const period = mr.text;
    const after = s.slice(mr.index + mr.text.length).trim();
    const trad = before.match(/^(.+?)\s[-–—]\s(.+)$/);
    if (trad) {
      return { title: trad[1].trim(), company: trad[2].trim(), period };
    }
    if (canCompanyFirstJobHeader(before, after)) {
      return { title: after.trim(), company: before.trim(), period };
    }
  }

  const yr = firstYearYearRange(s);
  if (yr && yr.index > 0) {
    const before = s.slice(0, yr.index).trim();
    const period = yr.text;
    const after = s.slice(yr.index + yr.text.length).trim();
    const trad = before.match(/^(.+?)\s[-–—]\s(.+)$/);
    if (trad) {
      return { title: trad[1].trim(), company: trad[2].trim(), period };
    }
    if (canCompanyFirstJobHeader(before, after)) {
      return { title: after.trim(), company: before.trim(), period };
    }
  }

  return null;
}

export function isEmbeddedJobHeaderLine(raw) {
  const s = stripLeadingBullet(raw);
  if (s.length < 15 || s.length > MAX_HEADER_LEN) return false;
  return parseEmbeddedJobHeader(s) != null;
}

/**
 * @returns {Array<{ kind: 'header' | 'bullet', text: string }>}
 */
export function parseExperienceDetailSegments(details) {
  const lines = String(details || '').split(/\n+/);
  const out = [];
  for (const line of lines) {
    const cleaned = stripLeadingBullet(line);
    if (!cleaned) continue;
    if (isEmbeddedJobHeaderLine(cleaned)) out.push({ kind: 'header', text: cleaned });
    else out.push({ kind: 'bullet', text: cleaned });
  }
  return out;
}
