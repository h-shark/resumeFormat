/**
 * Header contact line: normalize location to "City,ST,ZIP" (no spaces after commas).
 * Strips pasted URLs, pulls a trailing ZIP from the location string, and merges a leading
 * ZIP from the phone when the location has no ZIP (e.g. "30047 678…" + "Lilburn, GA").
 */

export function landryFormatContactLocation(locationRaw, phoneRaw) {
  const locIn = String(locationRaw || '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  let zipFromLoc = '';
  const locNoEndZip = locIn.replace(/[,\s]+(\d{5})$/, (_, z) => {
    zipFromLoc = z;
    return '';
  }).trim();

  const ph = String(phoneRaw || '').trim();
  let zipFromPhone = '';
  const zp = ph.match(/^(\d{5})\s+/);
  if (zp) zipFromPhone = zp[1];

  const zip = zipFromLoc || zipFromPhone || '';
  const parts = locNoEndZip.split(',').map((p) => p.trim().replace(/\s+/g, '')).filter(Boolean);
  const core = parts.join(',');
  if (!core && !zip) return '';
  if (!core) return '';
  if (core && zip) return `${core},${zip}`;
  return core;
}

export function landryContactPhoneDisplay(phoneRaw, locationFormatted) {
  const ph = String(phoneRaw || '').trim();
  if (!ph) return '';
  const m = ph.match(/^(\d{5})\s+(.+)$/);
  if (!m) return ph;
  if (locationFormatted && locationFormatted.endsWith(`,${m[1]}`)) return m[2].trim();
  return ph;
}
