import { jsPDF } from 'jspdf';
import { pdfAbsLinkUrl, pdfSafeText } from './landryPdf';

function ptToMm(pt) {
  return (pt * 25.4) / 72;
}

export function pdfTelHref(phoneRaw) {
  const s = String(phoneRaw || '').trim();
  if (!s) return '';
  const digits = s.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : `tel:${encodeURIComponent(s)}`;
}

function bulletsFromDetails(details) {
  return String(details || '')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

function chazSkillsFromText(skills) {
  return String(skills || '')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

async function fetchChazPdfBackgroundDataUrl() {
  const base = process.env.PUBLIC_URL || '';
  const path = `${base}/chaz-pdf-bg.png`;
  const url = path.startsWith('http') ? path : path.startsWith('/') ? path : `/${path}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** ChazTemplate.css — #22a86c, #2ecc71 highlight, #1a1a1a, #5c5c5c */
const CHAZ_GREEN = [34, 168, 108];
const CHAZ_GREEN_HI = [46, 204, 113];
const CHAZ_INK = [26, 26, 26];
const CHAZ_MUTED = [92, 92, 92];
const CHAZ_LINE = [232, 232, 232];

/** Shrink wrap width so splitTextToSize lines do not bleed into the aside (metric/render mismatch). */
const CHAZ_MAIN_WRAP_SAFETY_MM = 3;
const CHAZ_ASIDE_WRAP_SAFETY_MM = 1;

/**
 * Two-column Chaz PDF aligned with ChazTemplate.js preview: main = Summary + Experience;
 * aside = Skills + Education + Key achievements.
 * Render aside sections (Education, achievements) immediately after Skills, before Experience,
 * so main-column page breaks do not reset the aside cursor and leave a gap under Skills.
 * Full-bleed background from `public/chaz-pdf-bg.png` when present (same pattern as Landry PDF).
 */
export async function buildChazResumePdf(resume) {
  const bgDataUrl = await fetchChazPdfBackgroundDataUrl();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const hasBg = Boolean(bgDataUrl);
  const margin = hasBg ? 16 : 14;
  const marginTop = hasBg ? 15 : 14;
  const marginBottom = hasBg ? 22 : 14;
  const bottomY = pageH - marginBottom - 3;
  const colGap = 4;
  const contentW = pageW - 2 * margin;
  /* ~64/36 split: closer to CSS 1fr / minmax(9rem,31%) so the gutter matches the preview. */
  const mainW = contentW * 0.62;
  const asideW = contentW - mainW - colGap;
  const mainX = margin;
  const asideX = mainX + mainW + colGap;
  const mainWrapW = Math.max(20, mainW - CHAZ_MAIN_WRAP_SAFETY_MM);
  const asideWrapW = Math.max(18, asideW - CHAZ_ASIDE_WRAP_SAFETY_MM);

  function drawPdfPageBackground() {
    if (!bgDataUrl) return;
    try {
      pdf.addImage(bgDataUrl, 'PNG', 0, 0, pageW, pageH);
    } catch {
      /* omit background on embed/decode failure */
    }
  }

  drawPdfPageBackground();

  let yM = marginTop;
  let yA = marginTop;

  function newPage() {
    pdf.addPage();
    drawPdfPageBackground();
    yM = marginTop;
    yA = marginTop;
  }

  const inkSlack = 2;
  function ensureMain(need) {
    if (yM + need + inkSlack > bottomY) newPage();
  }
  function ensureAside(need) {
    if (yA + need + inkSlack > bottomY) newPage();
  }

  function sectionTitleGreen(text, x, yRef, maxW) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.setTextColor(CHAZ_GREEN[0], CHAZ_GREEN[1], CHAZ_GREEN[2]);
    const label = String(text).toUpperCase();
    pdf.text(label, x, yRef, { baseline: 'top', maxWidth: maxW });
    return ptToMm(7.2) * 1.05 + 2.2;
  }

  /* —— Header (full width, centered) —— */
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(CHAZ_GREEN[0], CHAZ_GREEN[1], CHAZ_GREEN[2]);
  const name = String(pdfSafeText(resume.fullName) || 'Your name').toUpperCase();
  const nameLines = pdf.splitTextToSize(name, contentW);
  for (const ln of nameLines) {
    ensureMain(ptToMm(18) * 1.08);
    pdf.text(ln, pageW / 2, yM, { align: 'center', baseline: 'top' });
    yM += ptToMm(18) * 1.06;
  }

  const head = String(pdfSafeText(resume.headline) || '').trim();
  if (head) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(CHAZ_MUTED[0], CHAZ_MUTED[1], CHAZ_MUTED[2]);
    const hl = pdf.splitTextToSize(head, contentW - 4);
    for (const ln of hl) {
      ensureMain(ptToMm(8) * 1.2);
      pdf.text(ln, pageW / 2, yM, { align: 'center', baseline: 'top' });
      yM += ptToMm(8) * 1.15;
    }
  }

  yM += 2;
  const contactY = yM;
  const items = [];
  if (resume.email?.trim()) items.push({ t: 'Email', url: `mailto:${resume.email.trim()}` });
  if (resume.phone?.trim()) {
    const pt = pdfSafeText(resume.phone).trim();
    items.push({ t: pt, url: pdfTelHref(pt) });
  }
  if (resume.linkedIn?.trim()) items.push({ t: 'LinkedIn', url: pdfAbsLinkUrl(resume.linkedIn) });
  if (resume.location?.trim()) items.push({ t: pdfSafeText(resume.location).trim(), url: '' });

  if (items.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    const sep = '     ·     ';
    let tw = 0;
    for (let i = 0; i < items.length; i++) {
      tw += pdf.getTextWidth(items[i].t);
      if (i < items.length - 1) tw += pdf.getTextWidth(sep);
    }
    let cx = (pageW - tw) / 2;
    ensureMain(ptToMm(7.5) * 1.5);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const w = pdf.getTextWidth(it.t);
      pdf.setTextColor(CHAZ_MUTED[0], CHAZ_MUTED[1], CHAZ_MUTED[2]);
      pdf.text(it.t, cx, contactY, { baseline: 'top' });
      if (it.url) {
        try {
          pdf.link(cx, contactY, w, 4, { url: it.url });
        } catch {
          /* ignore */
        }
      }
      cx += w;
      if (i < items.length - 1) {
        pdf.text(sep, cx, contactY, { baseline: 'top' });
        cx += pdf.getTextWidth(sep);
      }
    }
    yM = contactY + ptToMm(7.5) * 1.45;
  }

  yM += 3;
  pdf.setDrawColor(CHAZ_LINE[0], CHAZ_LINE[1], CHAZ_LINE[2]);
  pdf.setLineWidth(0.2);
  pdf.line(margin, yM, pageW - margin, yM);
  yM += 5;
  yA = yM;

  const fsBody = 8;
  const fsSmall = 7.5;
  const lhBody = ptToMm(fsBody) * 1.38;
  const lhSmall = ptToMm(fsSmall) * 1.32;
  /* Experience bullets: extra leading so descenders (g, y, p) clear the next line */
  const lhBullet = ptToMm(fsBody) * 1.52;
  const lhSkillWrap = ptToMm(fsSmall) * 1.45;

  /* —— Summary (main) —— */
  const summary = String(pdfSafeText(resume.summary) || '').trim();
  if (summary) {
    const h = sectionTitleGreen('Summary', mainX, yM, mainWrapW);
    yM += h;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(fsBody);
    pdf.setTextColor(CHAZ_MUTED[0], CHAZ_MUTED[1], CHAZ_MUTED[2]);
    const lines = pdf.splitTextToSize(summary, mainWrapW);
    for (const ln of lines) {
      ensureMain(lhBody);
      pdf.text(ln, mainX, yM, { baseline: 'top' });
      yM += lhBody;
    }
    yM += 3;
  }

  /* —— Skills (aside) —— */
  const skillItems = chazSkillsFromText(resume.skills || '');
  if (skillItems.length) {
    const h = sectionTitleGreen('Skills', asideX, yA, asideWrapW);
    yA += h;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(fsSmall);
    pdf.setTextColor(CHAZ_MUTED[0], CHAZ_MUTED[1], CHAZ_MUTED[2]);
    const skBulletPrefix = '•  ';
    const skBulletW = pdf.getTextWidth(skBulletPrefix);
    for (const sk of skillItems) {
      const skTextMax = Math.max(8, asideWrapW - skBulletW - 1);
      const wrapped = pdf.splitTextToSize(pdfSafeText(sk) || '', skTextMax);
      const skTextX = asideX + skBulletW;
      for (let si = 0; si < wrapped.length; si++) {
        ensureAside(lhSkillWrap);
        if (si === 0) pdf.text(skBulletPrefix + wrapped[si], asideX, yA, { baseline: 'top' });
        else pdf.text(wrapped[si], skTextX, yA, { baseline: 'top' });
        yA += lhSkillWrap;
      }
      yA += 0.35;
    }
    yA += 2;
  }

  /* Aside: Education + Key achievements before Experience so main-column page breaks
   * do not reset yA and strand Education on the next page below empty space. */
  const edus = (resume.education || []).filter((e) => e.school || e.degree);
  if (edus.length) {
    ensureAside(ptToMm(7.2) * 1.2);
    const h = sectionTitleGreen('Education', asideX, yA, asideWrapW);
    yA += h;
    const lhDeg = ptToMm(8.2) * 1.06;
    for (const row of edus) {
      if (!row.school && !row.degree) continue;
      const deg = String(pdfSafeText(row.degree) || '').trim();
      const sch = String(pdfSafeText(row.school) || '').trim();
      const meta = [row.period, row.location].filter(Boolean).map((x) => pdfSafeText(x)).join(' · ');

      if (deg) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.2);
        pdf.setTextColor(CHAZ_INK[0], CHAZ_INK[1], CHAZ_INK[2]);
        const dLines = pdf.splitTextToSize(deg, asideWrapW);
        for (const dl of dLines) {
          ensureAside(lhDeg);
          pdf.text(dl, asideX, yA, { baseline: 'top' });
          yA += lhDeg;
        }
      }
      if (sch) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fsSmall);
        pdf.setTextColor(CHAZ_MUTED[0], CHAZ_MUTED[1], CHAZ_MUTED[2]);
        const sLines = pdf.splitTextToSize(sch, asideWrapW);
        for (const sl of sLines) {
          ensureAside(lhSmall);
          pdf.text(sl, asideX, yA, { baseline: 'top' });
          yA += lhSmall;
        }
      }
      if (meta) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fsSmall);
        pdf.setTextColor(CHAZ_MUTED[0], CHAZ_MUTED[1], CHAZ_MUTED[2]);
        const mLines = pdf.splitTextToSize(meta, asideWrapW);
        for (const ml of mLines) {
          ensureAside(lhSmall);
          pdf.text(ml, asideX, yA, { baseline: 'top' });
          yA += lhSmall;
        }
      }
      yA += 2.2;
    }
  }

  const achs = (resume.achievements || []).filter((a) => a.title || a.description);
  if (achs.length) {
    ensureAside(ptToMm(7.2) * 1.2);
    const h = sectionTitleGreen('Key achievements', asideX, yA, asideWrapW);
    yA += h;
    const lhAchTit = ptToMm(8) * 1.12;
    for (const row of achs) {
      const tit = String(pdfSafeText(row.title) || '').trim();
      const desc = String(pdfSafeText(row.description) || '').trim();

      if (tit) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(CHAZ_INK[0], CHAZ_INK[1], CHAZ_INK[2]);
        const tLines = pdf.splitTextToSize(tit, asideWrapW);
        for (const tl of tLines) {
          ensureAside(lhAchTit);
          pdf.text(tl, asideX, yA, { baseline: 'top' });
          yA += lhAchTit;
        }
      }
      if (desc) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fsSmall);
        pdf.setTextColor(CHAZ_MUTED[0], CHAZ_MUTED[1], CHAZ_MUTED[2]);
        const dLines = pdf.splitTextToSize(desc, asideWrapW);
        for (const dl of dLines) {
          ensureAside(lhSmall);
          pdf.text(dl, asideX, yA, { baseline: 'top' });
          yA += lhSmall;
        }
      }
      yA += 2.8;
    }
  }

  /* —— Experience (main) —— */
  const exps = (resume.experience || []).filter((e) => e.title || e.company || e.details);
  const lhTitle = ptToMm(9) * 1.1;
  if (exps.length) {
    ensureMain(ptToMm(7.2) * 1.2);
    const expSecH = sectionTitleGreen('Experience', mainX, yM, mainWrapW);
    yM += expSecH;
    for (const row of exps) {
      if (!row.title && !row.company && !row.details) continue;

      const bullets = bulletsFromDetails(row.details || '');
      const titleText = String(pdfSafeText(row.title) || '').trim();
      const metaParts = [row.company, row.period, row.location].filter(Boolean).map((x) => pdfSafeText(x));
      const metaLine = metaParts.join(' · ');

      const pad = row.highlighted ? 1.5 : 0;
      const innerX = mainX + pad;
      const innerW = Math.max(mainW - pad * 2, 20);
      const innerWrapW = Math.max(12, innerW - CHAZ_MAIN_WRAP_SAFETY_MM);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      const titleLines = titleText ? pdf.splitTextToSize(titleText, innerWrapW) : [];
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fsSmall);
      const metaLines = metaLine ? pdf.splitTextToSize(metaLine, innerWrapW) : [];
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fsBody);
      const bulletHang = 1.5;
      const bulletPrefix = '•  ';
      const bulletW = pdf.getTextWidth(bulletPrefix);
      const bulletTextMax = Math.max(8, innerWrapW - bulletHang - bulletW - 0.5);
      const textStartX = innerX + bulletHang + bulletW;

      const blockTop = yM;
      const jobStartPage = pdf.internal.getCurrentPageInfo().pageNumber;
      if (row.highlighted) yM += pad;

      for (const tl of titleLines) {
        ensureMain(lhTitle);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(CHAZ_INK[0], CHAZ_INK[1], CHAZ_INK[2]);
        pdf.text(tl, innerX, yM, { baseline: 'top' });
        yM += lhTitle;
      }
      for (const ml of metaLines) {
        ensureMain(lhSmall);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fsSmall);
        pdf.setTextColor(CHAZ_MUTED[0], CHAZ_MUTED[1], CHAZ_MUTED[2]);
        pdf.text(ml, innerX, yM, { baseline: 'top' });
        yM += lhSmall;
      }
      if (metaLines.length) {
        ensureMain(0.8);
        yM += 0.8;
      }
      for (const b of bullets) {
        const lines = pdf.splitTextToSize(b, bulletTextMax);
        for (let bi = 0; bi < lines.length; bi++) {
          ensureMain(lhBullet);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(fsBody);
          pdf.setTextColor(CHAZ_MUTED[0], CHAZ_MUTED[1], CHAZ_MUTED[2]);
          if (bi === 0) {
            pdf.text(bulletPrefix + lines[bi], innerX + bulletHang, yM, { baseline: 'top' });
          } else {
            pdf.text(lines[bi], textStartX, yM, { baseline: 'top' });
          }
          yM += lhBullet;
        }
      }

      if (row.highlighted && yM > blockTop + 0.5) {
        const jobEndPage = pdf.internal.getCurrentPageInfo().pageNumber;
        if (jobStartPage === jobEndPage) {
          pdf.setDrawColor(CHAZ_GREEN_HI[0], CHAZ_GREEN_HI[1], CHAZ_GREEN_HI[2]);
          pdf.setLineWidth(0.45);
          const barX = mainX + 0.6;
          pdf.line(barX, blockTop + 0.5, barX, yM - 0.3);
          try {
            pdf.setLineWidth(0.3);
            pdf.roundedRect(mainX, blockTop, mainW, yM - blockTop + pad * 0.4, 1.2, 1.2, 'S');
          } catch {
            pdf.rect(mainX, blockTop, mainW, yM - blockTop + pad * 0.4, 'S');
          }
        }
        yM += pad;
      }
      yM += 2.8;
    }
  }

  const fileStem =
    String(resume.fullName || 'resume')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, ' ') || 'resume';
  const d = new Date();
  const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  pdf.save(`${fileStem}-${ts}.pdf`);
}
