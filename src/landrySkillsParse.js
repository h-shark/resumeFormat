/** Shared Landry skills text → category rows (preview + PDF). */

export function normalizeCommaSkillList(s) {
  return String(s || '')
    .split(',')
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(', ');
}

/**
 * Each input line: "Category: skill1, skill2" or bullet-prefixed. Plain lines (no colon) become skills-only rows.
 * A single line with no colons and no newlines is treated as a comma / · separated flat list (legacy).
 * @returns {{ category: string, skillsText: string }[]}
 */
export function parseLandrySkillRows(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);
  if (!lines.length) return [];

  const hasColonLine = lines.some((l) => /^.+?\s*:\s*.+/.test(l));
  if (!hasColonLine && lines.length === 1) {
    const tokens = lines[0]
      .split(/(?:\s*·\s*|,)+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!tokens.length) return [];
    return [{ category: '', skillsText: tokens.join(', ') }];
  }

  const rows = [];
  for (const line of lines) {
    const m = line.match(/^(.+?)\s*:\s*(.+)$/);
    if (m) {
      rows.push({
        category: m[1].trim(),
        skillsText: normalizeCommaSkillList(m[2].replace(/\s*·\s*/g, ',')),
      });
    } else {
      rows.push({
        category: '',
        skillsText: normalizeCommaSkillList(line.replace(/\s*·\s*/g, ',')),
      });
    }
  }
  return rows;
}
