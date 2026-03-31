import { jsPDF } from 'jspdf';
import { parseEmbeddedJobHeader, parseExperienceDetailSegments } from './experienceDetailSegments';
import { parseLandrySkillRows } from './landrySkillsParse';
import { landryContactPhoneDisplay, landryFormatContactLocation } from './landryContactFormat';

const GREEN = [75, 126, 79]; /* #4B7E4F */
const GREY = [117, 117, 117]; /* #757575 */
const LINK_BLUE = [59, 130, 246];
const INK = [17, 24, 39];
const LINE = [209, 213, 219];
const LANDRY_CERTIFICATES = [
  { name: 'Go', url: 'https://www.hackerrank.com/certificates/574a75231aad' },
  { name: 'React', url: 'https://www.hackerrank.com/certificates/97e6358fc255' },
  { name: 'Python', url: 'https://www.hackerrank.com/certificates/ace3934433ad' },
  { name: 'Rest', url: 'https://www.hackerrank.com/certificates/ce02365a3488' },
];
const LANDRY_SKILLS_FALLBACK =
  'Backend: Golang, Python, Node, SQL, NoSQL\nFrontend: React, TypeScript, Angular, Tailwind CSS, Accessibility\nAI: Prompt engineering, RAG basics, OpenAI API integration\nCloud development: AWS (EC2/S3), Docker, CI/CD pipelines';

function ptToMm(pt) {
  return (pt * 25.4) / 72;
}

export function pdfSafeText(s) {
  if (s == null || s === '') return s;
  return String(s)
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ');
}

export function pdfAbsLinkUrl(raw) {
  let str = String(raw || '').trim();
  if (!str) return '';
  if (!/^https?:\/\//i.test(str)) {
    if (/^www\./i.test(str) || /^linkedin\./i.test(str) || /^github\./i.test(str)) str = `https://${str}`;
  }
  return str;
}

async function fetchPdfBackgroundDataUrl() {
  const base = process.env.PUBLIC_URL || '';
  const path = `${base}/landry-pdf-bg.png`;
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

/** Same rules as LandryTemplate.js bulletsFromDetails — education & volunteer details in preview */
function bulletsFromDetails(details) {
  return String(details || '')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

function buildLandrySkillMatrixRows(text) {
  return parseLandrySkillRows(text).flatMap((row) => {
    const skills = String(row.skillsText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!skills.length) return [];
    return [{ category: row.category || '', skills }];
  });
}

function splitSkillMatrixColumns(groups) {
  const left = [];
  const right = [];
  groups.forEach((g, i) => {
    if (i % 2 === 0) left.push(g);
    else right.push(g);
  });
  return [left, right];
}

/**
 * Enhancv-style Landry: centered header, horizontal contact, timeline sections.
 * Draws optional full-bleed corner decoration from `/landry-pdf-bg.png` (see `public/`).
 */
export async function buildLandryResumePdf(resume) {
  const bgDataUrl = await fetchPdfBackgroundDataUrl();
  /** ISO 216 A4 portrait: 210 × 297 mm (`format: 'a4'` + `unit: 'mm'`). */
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const marginTop = 14;
  /** Minimum clear band above the physical page edge (print-safe). */
  const marginBottom = 14;
  /**
   * Pagination limit: a few mm above (pageH − marginBottom) so descenders and tight `lh`
   * don’t sit flush with the bottom when using baseline: 'top'.
   */
  const bottomY = pageH - marginBottom - 3.5;
  let y = marginTop;

  const dateColW = 40;
  const dateRight = margin + dateColW;
  const railX = dateRight + 3;
  const bodyX = railX + 5;
  const bodyW = pageW - margin - bodyX;

  /**
   * Tight vertical rhythm for timeline PDF.
   * Bullet/stack `lh` uses font em × factor (~1.0 = single-spacing in mm); keep ≤1.05 for dense body text.
   */
  const PDF_TIGHT = {
    secTitleLine: 1.02,
    tlBlockBase: 0.2,
    tlEnsureSlack: 1.05,
    tlEnsureBlockSlack: 1.05,
    tlDateLh: 1.1,
    tlLocLh: 1.06,
    tlRoleLh: 1.06,
    tlOrgLh: 1.06,
    /** Wrapped bullet lines (within one bullet + between bullets) */
    tlBulletLh: 1.12,
    tlEmb8Lh: 1.08,
    tlEmb75Lh: 1.1,
    tlSegHeaderGap: 0.2,
    tlRowGap: 1.05,
    tlStemExtra: 0.25,
    /** Extra inset between company row and first detail bullet (mm); 0 = flush */
    tlAfterOrgToBullets: 0,
  };

  function drawPdfPageBackground() {
    if (!bgDataUrl) return;
    try {
      pdf.addImage(bgDataUrl, 'PNG', 0, 0, pageW, pageH);
    } catch {
      /* omit background on embed/decode failure */
    }
  }

  drawPdfPageBackground();

  function newPage() {
    pdf.addPage();
    drawPdfPageBackground();
    y = marginTop;
  }

  /** Extra mm so `baseline: 'top'` + descenders / jsPDF line box stay inside the bottom band. */
  const ENSURE_INK_SLACK = 2;

  function ensure(need) {
    if (y + need + ENSURE_INK_SLACK > bottomY) newPage();
  }

  function sectionTitle(label) {
    ensure(10);
    pdf.setCharSpace(0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(INK[0], INK[1], INK[2]);
    pdf.text(String(label).toUpperCase(), margin, y, { baseline: 'top' });
    y += ptToMm(8.5) * PDF_TIGHT.secTitleLine + 0.8;
  }

  /* —— Header —— (name matches section titles e.g. SUMMARY — INK) */
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(INK[0], INK[1], INK[2]);
  const name = String(pdfSafeText(resume.fullName) || 'Your name').toUpperCase();
  const nameLines = pdf.splitTextToSize(name, pageW - 2 * margin);
  for (const ln of nameLines) {
    ensure(ptToMm(20) * 1.1);
    pdf.text(ln, pageW / 2, y, { align: 'center', baseline: 'top' });
    y += ptToMm(20) * 1.08;
  }

  const head = String(pdfSafeText(resume.headline) || '').trim();
  if (head) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    const hl = pdf.splitTextToSize(head, pageW - 2 * margin);
    for (const ln of hl) {
      ensure(ptToMm(9) * 1.25);
      pdf.text(ln, pageW / 2, y, { align: 'center', baseline: 'top' });
      y += ptToMm(9) * 1.22;
    }
  }

  pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  y += 2;
  /* Order and labels match LandryTemplate.js landry-contact-bar */
  const contactItems = [];
  if (resume.email?.trim()) {
    contactItems.push({
      display: resume.email.trim(),
      url: `mailto:${resume.email.trim()}`,
    });
  }
  if (resume.linkedIn?.trim()) {
    contactItems.push({
      display: 'LinkedIn',
      url: pdfAbsLinkUrl(resume.linkedIn),
    });
  }
  const contactLocationDisplay = landryFormatContactLocation(resume.location, resume.phone);
  const contactPhoneDisplay = landryContactPhoneDisplay(resume.phone, contactLocationDisplay);
  if (contactLocationDisplay) {
    contactItems.push({ display: pdfSafeText(contactLocationDisplay), url: '' });
  }
  if (contactPhoneDisplay) {
    contactItems.push({ display: pdfSafeText(contactPhoneDisplay), url: '' });
  }
  if (resume.github?.trim()) {
    contactItems.push({
      display: 'GitHub',
      url: pdfAbsLinkUrl(resume.github),
    });
  }

  if (contactItems.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const sep = '   ·   ';
    let totalW = 0;
    for (let i = 0; i < contactItems.length; i++) {
      totalW += pdf.getTextWidth(contactItems[i].display);
      if (i < contactItems.length - 1) totalW += pdf.getTextWidth(sep);
    }
    let cx = (pageW - totalW) / 2;
    ensure(ptToMm(8) * 1.5);
    for (let i = 0; i < contactItems.length; i++) {
      const c = contactItems[i];
      const tw = pdf.getTextWidth(c.display);
      if (c.url) {
        pdf.setTextColor(LINK_BLUE[0], LINK_BLUE[1], LINK_BLUE[2]);
      } else {
        pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
      }
      pdf.text(c.display, cx, y, { baseline: 'top' });
      if (c.url) {
        const fontMm = ptToMm(pdf.getFontSize());
        const underlineY = y + fontMm * 0.8;
        pdf.setDrawColor(LINK_BLUE[0], LINK_BLUE[1], LINK_BLUE[2]);
        pdf.setLineWidth(0.12);
        pdf.line(cx, underlineY, cx + tw, underlineY);
        try {
          pdf.link(cx, y, tw, 4.5, { url: c.url });
        } catch {
          /* ignore */
        }
      }
      cx += tw;
      if (i < contactItems.length - 1) {
        pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
        pdf.text(sep, cx, y, { baseline: 'top' });
        cx += pdf.getTextWidth(sep);
      }
    }
    y += ptToMm(8) * 1.6;
  }

  y += 3;
  pdf.setDrawColor(LINE[0], LINE[1], LINE[2]);
  pdf.setLineWidth(0.2);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;

  function writeParagraph(text, fs = 9) {
    const raw = String(pdfSafeText(text) || '').trim();
    if (!raw) return;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(fs);
    pdf.setTextColor(INK[0], INK[1], INK[2]);
    const lh = ptToMm(fs) * 1.28;
    const lines = pdf.splitTextToSize(raw, pageW - 2 * margin);
    for (const ln of lines) {
      ensure(lh);
      pdf.text(ln, margin, y, { baseline: 'top' });
      y += lh;
    }
    y += 0.9;
  }

  /** Height reserve for ensure() — must align with draw loop so we don’t new-page between section title and first row. */
  function timelineRowEnsureHeight(row, opts) {
    const {
      titleKey,
      orgKey,
      periodKey,
      locKey,
      detailsKey,
      titleCaps,
      detailsMode = 'segments',
      projectLayout = false,
    } = opts;
    const period = String(pdfSafeText(row[periodKey]) || '').trim();
    const loc = String(pdfSafeText(row[locKey]) || '').trim();
    let role = String(pdfSafeText(row[titleKey]) || '').trim();
    let org = String(pdfSafeText(row[orgKey]) || '').trim();
    const details = String(row[detailsKey] || '');
    let skipOrgLine = false;
    if (projectLayout) {
      const nm = String(pdfSafeText(row.name) || '').trim();
      const tc = String(pdfSafeText(row.tech) || '').trim();
      role = [nm, tc].filter(Boolean).join(' — ') || 'Project';
      org = '';
      skipOrgLine = true;
    } else if (!role && org) {
      role = org;
      skipOrgLine = true;
    }
    const fsL = 7.5;
    const fsBody = 8.5;
    const lhL = ptToMm(fsL) * PDF_TIGHT.tlDateLh;
    const lhLoc = ptToMm(fsL) * PDF_TIGHT.tlLocLh;
    const titleStr = titleCaps ? role.toUpperCase() : role;
    let h = PDF_TIGHT.tlBlockBase;
    if (period) h += pdf.splitTextToSize(period, dateColW - 2).length * lhL;
    if (loc) h += pdf.splitTextToSize(loc, dateColW - 2).length * lhLoc;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fsBody);
    const titleLines = titleStr ? pdf.splitTextToSize(titleStr, bodyW) : [];
    h += titleLines.length * ptToMm(fsBody) * PDF_TIGHT.tlRoleLh;
    if (org && !skipOrgLine) {
      pdf.setFontSize(8);
      h += pdf.splitTextToSize(pdfSafeText(org), bodyW).length * ptToMm(8) * PDF_TIGHT.tlOrgLh;
    }
    const fsB = 8;
    const lhB = ptToMm(fsB) * PDF_TIGHT.tlBulletLh;
    const segs = detailsMode === 'segments' ? parseExperienceDetailSegments(details) : null;
    const simpleLines = detailsMode === 'simpleBullets' ? bulletsFromDetails(details) : null;
    if (segs) {
      for (const s of segs) {
        if (s.kind === 'header') {
          const p = parseEmbeddedJobHeader(s.text);
          if (p) {
            h += PDF_TIGHT.tlSegHeaderGap;
            h += pdf.splitTextToSize(String(p.title).toUpperCase(), bodyW).length * ptToMm(8) * PDF_TIGHT.tlEmb8Lh;
            h += pdf.splitTextToSize(p.period, bodyW).length * ptToMm(7.5) * PDF_TIGHT.tlEmb75Lh;
            h += pdf.splitTextToSize(p.company, bodyW).length * ptToMm(8) * PDF_TIGHT.tlEmb8Lh;
          } else {
            h += pdf.splitTextToSize(pdfSafeText(s.text), bodyW).length * ptToMm(8) * PDF_TIGHT.tlEmb8Lh;
          }
        } else {
          h += pdf.splitTextToSize(pdfSafeText(s.text), bodyW - 4).length * lhB;
        }
      }
    } else if (simpleLines) {
      for (const line of simpleLines) {
        h += pdf.splitTextToSize(pdfSafeText(line), bodyW - 4).length * lhB;
      }
    }
    return h + PDF_TIGHT.tlEnsureSlack;
  }

  /** Avoid printing the section title on the previous page when the first timeline row must break to a new page. */
  function ensureTimelineSectionStart(rows, opts) {
    if (!rows?.length) return;
    const titleH = ptToMm(8.5) * PDF_TIGHT.secTitleLine + 0.25;
    const need = titleH + timelineRowEnsureHeight(rows[0], opts);
    if (y + need + ENSURE_INK_SLACK > bottomY) newPage();
  }

  function drawTimelineRows(rows, opts) {
    const {
      titleKey,
      orgKey,
      periodKey,
      locKey,
      detailsKey,
      titleCaps,
      /** 'segments' = LandryDetailBody (embedded jobs); 'simpleBullets' = education/volunteer bullets only */
      detailsMode = 'segments',
      /** LandryTemplate projects: one black line "Name — Tech", no green org row */
      projectLayout = false,
    } = opts;
    /** Grey stem below each dot + connector to next row (preview .landry-tl-line); last row still gets a tail so single entries aren't dot-only */
    let prevStemEndY = null;
    let prevStemPage = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const period = String(pdfSafeText(row[periodKey]) || '').trim();
      const loc = String(pdfSafeText(row[locKey]) || '').trim();
      let role = String(pdfSafeText(row[titleKey]) || '').trim();
      let org = String(pdfSafeText(row[orgKey]) || '').trim();
      const details = String(row[detailsKey] || '');
      let skipOrgLine = false;
      if (projectLayout) {
        const nm = String(pdfSafeText(row.name) || '').trim();
        const tc = String(pdfSafeText(row.tech) || '').trim();
        role = [nm, tc].filter(Boolean).join(' — ') || 'Project';
        org = '';
        skipOrgLine = true;
      } else if (!role && org) {
        role = org;
        skipOrgLine = true;
      }

      const fsL = 7.5;
      const fsBody = 8.5;
      const lhL = ptToMm(fsL) * PDF_TIGHT.tlDateLh;
      const lhLoc = ptToMm(fsL) * PDF_TIGHT.tlLocLh;
      const titleStr = titleCaps ? role.toUpperCase() : role;

      /* Only reserve the “header” of the row (dates + title + company). Reserving full details made
         ensure() skip to the next page whenever the *entire* job didn’t fit, leaving a huge gap. */
      let rowHeaderOnlyH = PDF_TIGHT.tlBlockBase;
      if (period) {
        const pl = pdf.splitTextToSize(period, dateColW - 2);
        rowHeaderOnlyH += pl.length * lhL;
      }
      if (loc) {
        const ll = pdf.splitTextToSize(loc, dateColW - 2);
        rowHeaderOnlyH += ll.length * lhLoc;
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fsBody);
      const titleLines = titleStr ? pdf.splitTextToSize(titleStr, bodyW) : [];
      rowHeaderOnlyH += titleLines.length * ptToMm(fsBody) * PDF_TIGHT.tlRoleLh;
      if (org && !skipOrgLine) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        const ol = pdf.splitTextToSize(pdfSafeText(org), bodyW);
        rowHeaderOnlyH += ol.length * ptToMm(8) * PDF_TIGHT.tlOrgLh;
      }
      const fsB = 8;
      const lhB = ptToMm(fsB) * PDF_TIGHT.tlBulletLh;
      const segs = detailsMode === 'segments' ? parseExperienceDetailSegments(details) : null;
      const simpleLines = detailsMode === 'simpleBullets' ? bulletsFromDetails(details) : null;

      ensure(rowHeaderOnlyH + PDF_TIGHT.tlEnsureBlockSlack + 1);
      const y0 = y;
      const pageNum = pdf.internal.getCurrentPageInfo().pageNumber;
      if (prevStemEndY != null && prevStemPage === pageNum) {
        pdf.setDrawColor(LINE[0], LINE[1], LINE[2]);
        pdf.setLineWidth(0.25);
        pdf.line(railX, prevStemEndY, railX, y0 + 1.55);
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fsL);
      pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
      let yL = y0;
      let yB = y0;
      /** Set after the rail dot is drawn; used to draw stem segments per page when the row breaks across pages. */
      let stemPageTop = null;
      /** Timeline body uses yL/yB, not global y — `ensure()` alone would never see the real cursor. */
      function ensureBodyLine(lineStepMm) {
        const yy = Math.max(yL, yB);
        if (yy + lineStepMm + ENSURE_INK_SLACK > bottomY) {
          if (stemPageTop != null) {
            pdf.setDrawColor(LINE[0], LINE[1], LINE[2]);
            pdf.setLineWidth(0.25);
            if (bottomY > stemPageTop) {
              pdf.line(railX, stemPageTop, railX, bottomY);
            }
          }
          newPage();
          yL = marginTop;
          yB = marginTop;
          if (stemPageTop != null) stemPageTop = marginTop;
        }
      }

      if (period) {
        for (const pl of pdf.splitTextToSize(period, dateColW - 2)) {
          ensureBodyLine(lhL);
          pdf.text(pl, dateRight, yL, { align: 'right', baseline: 'top' });
          yL += lhL;
        }
      }
      if (loc) {
        for (const ll of pdf.splitTextToSize(loc, dateColW - 2)) {
          ensureBodyLine(lhLoc);
          pdf.text(ll, dateRight, yL, { align: 'right', baseline: 'top' });
          yL += lhLoc;
        }
      }

      pdf.setFillColor(INK[0], INK[1], INK[2]);
      pdf.circle(railX, y0 + 1.55, 1.05, 'F');
      stemPageTop = y0 + 2.85;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fsBody);
      pdf.setTextColor(INK[0], INK[1], INK[2]);
      const stepRole = ptToMm(fsBody) * PDF_TIGHT.tlRoleLh;
      for (const tl of titleLines) {
        ensureBodyLine(stepRole);
        pdf.text(tl, bodyX, yB, { baseline: 'top' });
        yB += stepRole;
      }
      if (org && !skipOrgLine) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
        const stepOrg = ptToMm(8) * PDF_TIGHT.tlOrgLh;
        for (const ol of pdf.splitTextToSize(pdfSafeText(org), bodyW)) {
          ensureBodyLine(stepOrg);
          pdf.text(ol, bodyX, yB, { baseline: 'top' });
          yB += stepOrg;
        }
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fsB);
      pdf.setTextColor(INK[0], INK[1], INK[2]);
      if (segs) {
        for (const s of segs) {
          if (s.kind === 'header') {
            const p = parseEmbeddedJobHeader(s.text);
            yB += PDF_TIGHT.tlSegHeaderGap;
            if (p) {
              const stepEmb8 = ptToMm(8) * PDF_TIGHT.tlEmb8Lh;
              const stepEmb75 = ptToMm(7.5) * PDF_TIGHT.tlEmb75Lh;
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(8);
              pdf.setTextColor(INK[0], INK[1], INK[2]);
              for (const tl of pdf.splitTextToSize(String(p.title).toUpperCase(), bodyW)) {
                ensureBodyLine(stepEmb8);
                pdf.text(tl, bodyX, yB, { baseline: 'top' });
                yB += stepEmb8;
              }
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(7.5);
              pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
              for (const pl of pdf.splitTextToSize(p.period, bodyW)) {
                ensureBodyLine(stepEmb75);
                pdf.text(pl, bodyX, yB, { baseline: 'top' });
                yB += stepEmb75;
              }
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(8);
              pdf.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
              for (const ol of pdf.splitTextToSize(p.company, bodyW)) {
                ensureBodyLine(stepEmb8);
                pdf.text(ol, bodyX, yB, { baseline: 'top' });
                yB += stepEmb8;
              }
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(fsB);
              pdf.setTextColor(INK[0], INK[1], INK[2]);
            } else {
              const stepEmb8 = ptToMm(8) * PDF_TIGHT.tlEmb8Lh;
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(8);
              for (const tl of pdf.splitTextToSize(pdfSafeText(s.text), bodyW)) {
                ensureBodyLine(stepEmb8);
                pdf.text(tl, bodyX, yB, { baseline: 'top' });
                yB += stepEmb8;
              }
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(fsB);
            }
          } else {
            const wrapped = pdf.splitTextToSize(pdfSafeText(s.text), bodyW - 4);
            for (let wi = 0; wi < wrapped.length; wi++) {
              ensureBodyLine(lhB);
              if (wi === 0) {
                pdf.setFillColor(INK[0], INK[1], INK[2]);
                pdf.rect(bodyX, yB + ptToMm(fsB) * 0.2, 0.75, 0.75, 'F');
              }
              pdf.text(wrapped[wi], bodyX + 2.8, yB, { baseline: 'top' });
              yB += lhB;
            }
          }
        }
      } else if (simpleLines) {
        for (const line of simpleLines) {
          const wrapped = pdf.splitTextToSize(pdfSafeText(line), bodyW - 4);
          for (let wi = 0; wi < wrapped.length; wi++) {
            ensureBodyLine(lhB);
            if (wi === 0) {
              pdf.setFillColor(INK[0], INK[1], INK[2]);
              pdf.rect(bodyX, yB + ptToMm(fsB) * 0.2, 0.75, 0.75, 'F');
            }
            pdf.text(wrapped[wi], bodyX + 2.8, yB, { baseline: 'top' });
            yB += lhB;
          }
        }
      }

      const rowBottom = Math.max(yL, yB);
      pdf.setDrawColor(LINE[0], LINE[1], LINE[2]);
      pdf.setLineWidth(0.25);
      const stemEnd = Math.max(rowBottom + PDF_TIGHT.tlStemExtra, (stemPageTop ?? y0 + 2.85) + 1);
      const stemTopFinal = stemPageTop ?? y0 + 2.85;
      if (stemEnd > stemTopFinal) {
        pdf.line(railX, stemTopFinal, railX, stemEnd);
      }
      prevStemEndY = stemEnd;
      prevStemPage = pdf.internal.getCurrentPageInfo().pageNumber;

      y = rowBottom + PDF_TIGHT.tlRowGap;
    }
  }

  if (resume.summary?.trim()) {
    sectionTitle('Summary');
    writeParagraph(resume.summary, 9);
    y += 1;
  }

  const eduOpts = {
    titleKey: 'degree',
    orgKey: 'school',
    periodKey: 'period',
    locKey: 'location',
    detailsKey: 'details',
    titleCaps: false,
    detailsMode: 'simpleBullets',
  };
  const eduRows = (resume.education || []).filter((e) => e.school || e.degree || e.details);
  if (eduRows.length) {
    ensureTimelineSectionStart(eduRows, eduOpts);
    sectionTitle('Education');
    drawTimelineRows(eduRows, eduOpts);
    y += 0.5;
  }

  if (LANDRY_CERTIFICATES.length) {
    ensure(ptToMm(8.5) * PDF_TIGHT.secTitleLine + 16);
    sectionTitle('Certificates');

    const certFs = 8;
    const certLh = ptToMm(certFs) * 1.12;
    const certGap = 0.2;
    const certNameColW = 18;
    const certSectionTop = y;
    const certDotY = certSectionTop + 1.55;
    const certStemTop = certSectionTop + 2.85;

    pdf.setFillColor(INK[0], INK[1], INK[2]);
    pdf.circle(railX, certDotY, 1.05, 'F');

    let yCert = certSectionTop;
    for (const cert of LANDRY_CERTIFICATES) {
      const certName = String(pdfSafeText(cert.name) || '').trim();
      const certUrl = String(pdfSafeText(cert.url) || '').trim();
      const certAbsUrl = pdfAbsLinkUrl(cert.url);
      const certLabel = `${certName}:`;
      const certUrlX = bodyX + certNameColW;
      const certUrlW = Math.max(10, bodyW - certNameColW);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(certFs);
      pdf.setTextColor(INK[0], INK[1], INK[2]);
      ensure(certLh + 1);
      pdf.text(certLabel, bodyX, yCert, { baseline: 'top' });

      const urlFirstLines = pdf.splitTextToSize(certUrl, certUrlW);
      const firstLine = urlFirstLines[0] || certUrl;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(certFs);
      pdf.setTextColor(LINK_BLUE[0], LINK_BLUE[1], LINK_BLUE[2]);
      pdf.text(firstLine, certUrlX, yCert, { baseline: 'top' });
      const firstW = pdf.getTextWidth(firstLine);
      const firstUnderlineY = yCert + ptToMm(certFs) * 0.82;
      pdf.setDrawColor(LINK_BLUE[0], LINK_BLUE[1], LINK_BLUE[2]);
      pdf.setLineWidth(0.12);
      pdf.line(certUrlX, firstUnderlineY, certUrlX + firstW, firstUnderlineY);
      try {
        pdf.link(certUrlX, yCert, firstW, certLh, { url: certAbsUrl });
      } catch {
        /* ignore invalid links */
      }
      yCert += certLh;

      const remaining = certUrl.slice(firstLine.length).trim();
      if (remaining) {
        const remLines = pdf.splitTextToSize(remaining, bodyW);
        for (const remLine of remLines) {
          ensure(certLh + 1);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(certFs);
          pdf.setTextColor(LINK_BLUE[0], LINK_BLUE[1], LINK_BLUE[2]);
          pdf.text(remLine, bodyX, yCert, { baseline: 'top' });
          const remW = pdf.getTextWidth(remLine);
          const remUnderlineY = yCert + ptToMm(certFs) * 0.82;
          pdf.setDrawColor(LINK_BLUE[0], LINK_BLUE[1], LINK_BLUE[2]);
          pdf.setLineWidth(0.12);
          pdf.line(bodyX, remUnderlineY, bodyX + remW, remUnderlineY);
          try {
            pdf.link(bodyX, yCert, remW, certLh, { url: certAbsUrl });
          } catch {
            /* ignore invalid links */
          }
          yCert += certLh;
        }
      }
      yCert += certGap;
    }

    const certStemEnd = Math.max(yCert + 0.1, certStemTop + 1);
    pdf.setDrawColor(LINE[0], LINE[1], LINE[2]);
    pdf.setLineWidth(0.25);
    pdf.line(railX, certStemTop, railX, certStemEnd);
    y = yCert + 0.5;
  }

  const expOpts = {
    titleKey: 'title',
    orgKey: 'company',
    periodKey: 'period',
    locKey: 'location',
    detailsKey: 'details',
    titleCaps: true,
    detailsMode: 'segments',
  };
  const expRows = (resume.experience || []).filter((e) => e.title || e.company || e.details);
  if (expRows.length) {
    ensureTimelineSectionStart(expRows, expOpts);
    sectionTitle('Experience');
    drawTimelineRows(expRows, expOpts);
    y += 0.5;
  }

  const volOpts = {
    titleKey: 'title',
    orgKey: 'organization',
    periodKey: 'period',
    locKey: 'location',
    detailsKey: 'details',
    titleCaps: false,
    detailsMode: 'simpleBullets',
  };
  const volRows = (resume.volunteerExperience || []).filter((v) => v.title || v.organization || v.details);
  if (volRows.length) {
    ensureTimelineSectionStart(volRows, volOpts);
    sectionTitle('Volunteer experience');
    drawTimelineRows(volRows, volOpts);
    y += 0.5;
  }

  const skillRows = buildLandrySkillMatrixRows(
    parseLandrySkillRows(resume.skills || '').length ? resume.skills || '' : LANDRY_SKILLS_FALLBACK,
  );
  if (skillRows.length) {
    sectionTitle('Skills');
    const catLh = ptToMm(7) * 1.12;
    const rowLh = ptToMm(8) * 1.34;
    const colGap = 8;
    const colW = (pageW - 2 * margin - colGap) / 2;
    const leftX = margin;
    const rightX = margin + colW + colGap;
    const dotGap = 2.2;
    const dotR = 0.75;
    const [leftCol, rightCol] = splitSkillMatrixColumns(skillRows);
    let yLeft = y;
    let yRight = y;
    const renderCol = (groups, x, yStart) => {
      let yy = yStart;
      for (const group of groups) {
        if (group.category?.trim()) {
          ensure(yy - y + catLh + 1);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7);
          pdf.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
          pdf.text(String(pdfSafeText(group.category)).toUpperCase(), x, yy, { baseline: 'top' });
          yy += catLh;
        }
        for (const skill of group.skills) {
          ensure(yy - y + rowLh + 1);
          const dotsStartX = x + colW - 12;
          const nameW = Math.max(18, dotsStartX - x - 3);
          const shown = (pdf.splitTextToSize(String(pdfSafeText(skill) || ''), nameW) || [skill])[0];
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(INK[0], INK[1], INK[2]);
          pdf.text(shown, x, yy, { baseline: 'top' });
          for (let i = 0; i < 5; i++) {
            pdf.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
            pdf.circle(dotsStartX + i * dotGap, yy + rowLh * 0.45, dotR, 'F');
          }
          yy += rowLh;
        }
        yy += 0.6;
      }
      return yy;
    };
    yLeft = renderCol(leftCol, leftX, yLeft);
    yRight = renderCol(rightCol, rightX, yRight);
    y = Math.max(yLeft, yRight);
  }

  if (resume.references?.trim()) {
    sectionTitle('References');
    writeParagraph(resume.references, 8);
  }

  const projOpts = {
    titleKey: 'name',
    orgKey: 'tech',
    periodKey: 'period',
    locKey: 'location',
    detailsKey: 'details',
    titleCaps: false,
    detailsMode: 'segments',
    projectLayout: true,
  };
  const projRows = (resume.projects || []).filter((p) => p.name || p.tech || p.details);
  if (projRows.length) {
    ensureTimelineSectionStart(projRows, projOpts);
    sectionTitle('Projects');
    drawTimelineRows(projRows, projOpts);
  }

  const fileStem =
    String(resume.fullName || 'resume')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'resume';
  pdf.save(`${fileStem}.pdf`);
}
