import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { extractTextAndAnnotationLinksFromPdf, parseResumeFromPdfText } from './resumePdfParse';
import { drawPdfSectionIcon, pdfSectionIconKey } from './pdfSectionIcons';
import './KaronTemplate.css';

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Document-with-lines icon for the Summary section (preview + editor). */
function SummarySectionIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

/** Briefcase icon for the Experience section (preview + editor). */
function ExperienceSectionIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

/** Stacked layers — projects / portfolio. */
function ProjectsSectionIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

/** Open book — education. */
function EducationSectionIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

/** Award ribbon — certifications. */
function CertificationsSectionIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

/** Sliders — skills / competencies. */
function SkillsSectionIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

const SECTION_TITLE_TEAL = /^(summary|experience|projects|education|certifications|skills)$/i;
const KARON_FIXED_CERTIFICATES = [
  {
    url: 'https://www.hackerrank.com/certificates/d93c62b02d33',
    title: 'Go (Intermediate) Verified',
  },
  {
    url: 'https://www.hackerrank.com/certificates/77091f342093',
    title: 'Python (Basic) Verified',
  },
  {
    url: 'https://www.hackerrank.com/certificates/957ce430108e',
    title: 'React Verified',
  },
  {
    url: 'https://www.hackerrank.com/certificates/ecaa0ad6f025',
    title: 'Rest API Verified',
  },
  {
    url: 'https://www.hackerrank.com/certificates/68d66214149e',
    title: 'SQL (Advanced) Verified',
  },
];

const PDF_TEXT_TIMEOUT_MS = 120_000;

function extractTextAndLinksFromPdfWithTimeout(arrayBuffer, ms = PDF_TEXT_TIMEOUT_MS) {
  return Promise.race([
    extractTextAndAnnotationLinksFromPdf(arrayBuffer),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('PDF text extraction timed out')), ms);
    }),
  ]);
}

function ptToMm(pt) {
  return (pt * 25.4) / 72;
}

function publicAssetUrl(filename) {
  const pub = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const path = `${pub}/${filename}`.replace(/\/+/g, '/');
  return new URL(path, window.location.origin).href;
}

let pdfBackgroundLoadPromise = null;

/** Loads resume-pdf-bg.png from /public once per session (decorative frame per PDF page). */
function loadPdfBackgroundDataUrl() {
  if (!pdfBackgroundLoadPromise) {
    pdfBackgroundLoadPromise = (async () => {
      try {
        const res = await fetch(publicAssetUrl('resume-pdf-bg.png'));
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();
  }
  return pdfBackgroundLoadPromise;
}

/** Standard PDF fonts (Helvetica) use WinAnsi; map common Unicode punctuation. */
function pdfSafeText(s) {
  if (s == null || s === '') return s;
  return String(s)
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ');
}

/** Absolute https URL for PDF URI annotations. */
function pdfAbsLinkUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    if (/^www\./i.test(s) || /^linkedin\./i.test(s) || /^github\./i.test(s)) s = `https://${s}`;
  }
  return s;
}

/**
 * Contact line: email · phone · location · LinkedIn · GitHub (links on same line as location when space allows).
 * @returns y (mm) below the contact block
 */
function writePdfContactSection(pdf, resume, yStart, marginX, maxW, fontSize, leadingMult, ensureSpaceMm, ptToMmFn) {
  const gray = [107, 114, 128];
  const linkBlue = [59, 130, 246];
  const midDot = ' · ';
  const lh = ptToMmFn(fontSize) * leadingMult;

  const primaryStr = [resume.email, resume.phone, resume.location].filter(Boolean).join(midDot);
  const linkItems = [];
  if (resume.linkedIn?.trim()) {
    const url = pdfAbsLinkUrl(resume.linkedIn);
    if (url) linkItems.push({ label: 'LinkedIn', url });
  }
  if (resume.github?.trim()) {
    const url = pdfAbsLinkUrl(resume.github);
    if (url) linkItems.push({ label: 'GitHub', url });
  }

  if (!primaryStr && !linkItems.length) return yStart;

  pdf.setCharSpace(0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(fontSize);

  let y = yStart;
  let x = marginX;

  if (!primaryStr) {
    ensureSpaceMm(lh);
    let first = true;
    for (const item of linkItems) {
      const sepW = pdf.getTextWidth(midDot);
      const tw = pdf.getTextWidth(item.label);
      if (!first && x + sepW + tw > marginX + maxW) {
        y += lh;
        x = marginX;
        ensureSpaceMm(lh);
      }
      if (!first) {
        pdf.setTextColor(gray[0], gray[1], gray[2]);
        pdf.text(midDot, x, y, { baseline: 'top' });
        x += sepW;
      }
      pdf.setTextColor(linkBlue[0], linkBlue[1], linkBlue[2]);
      pdf.text(item.label, x, y, { baseline: 'top' });
      const hitH = Math.max(ptToMmFn(fontSize) * 1.2, lh * 0.95);
      try {
        pdf.link(x, y, tw, hitH, { url: item.url });
      } catch (e) {
        console.warn('PDF link skipped:', e);
      }
      x += tw;
      first = false;
    }
    return y + lh;
  }

  const lines = pdf.splitTextToSize(pdfSafeText(primaryStr), maxW);
  for (let i = 0; i < lines.length; i++) {
    ensureSpaceMm(lh);
    pdf.setTextColor(gray[0], gray[1], gray[2]);
    pdf.text(lines[i], marginX, y, { baseline: 'top' });
    if (i < lines.length - 1) y += lh;
  }

  if (!linkItems.length) {
    return y + lh;
  }

  x = marginX + pdf.getTextWidth(lines[lines.length - 1]);

  for (const item of linkItems) {
    const sepW = pdf.getTextWidth(midDot);
    const tw = pdf.getTextWidth(item.label);
    if (x + sepW + tw > marginX + maxW) {
      y += lh;
      x = marginX;
      ensureSpaceMm(lh);
    }
    pdf.setTextColor(gray[0], gray[1], gray[2]);
    pdf.text(midDot, x, y, { baseline: 'top' });
    x += sepW;
    pdf.setTextColor(linkBlue[0], linkBlue[1], linkBlue[2]);
    pdf.text(item.label, x, y, { baseline: 'top' });
    const hitH = Math.max(ptToMmFn(fontSize) * 1.2, lh * 0.95);
    try {
      pdf.link(x, y, tw, hitH, { url: item.url });
    } catch (e) {
      console.warn('PDF link skipped:', e);
    }
    x += tw;
  }

  return y + lh;
}

/**
 * Builds an A4 PDF with real text operators (not a screenshot) so content stays
 * selectable, searchable, and editable in Acrobat and similar tools.
 * @param {string|null} backgroundDataUrl - PNG data URL for full-page background (each page).
 */
function buildEditableResumePdf(resume, backgroundDataUrl) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  /* Match .karon-page: padding 14mm 18mm */
  const marginY = 14;
  const marginX = 18;
  const maxW = pageW - 2 * marginX;
  const bottomLimit = pageH - marginY;
  let y = marginY;

  /* ~16px root rem → mm (browser print) */
  const rem = (25.4 / 96) * 16;
  const blockGap = 0.85 * rem; /* .karon-preview-block margin-bottom */
  const itemGap = 0.65 * rem; /* .karon-preview-item margin-bottom */
  const itemBodyTop = 0.25 * rem; /* .karon-preview-item__body margin-top */
  const contactPadBottom = 0.65 * rem; /* .karon-preview-contact padding-bottom */
  const contactBlockBottom = 1 * rem; /* .karon-preview-contact margin-bottom */
  const h1After = 0.15 * rem; /* h1 margin-bottom */
  const sectionTitleCharSpace = 0.32; /* ~0.08em on 10pt (jsPDF: pt between glyphs) */
  const sectionRuleLineMm = (2 / 96) * 25.4; /* 2px teal rule */
  const headingPadBelowText = 0.2 * rem; /* padding under section title text */
  const headingBelowRule = 0.4 * rem; /* margin below heading row */
  /* Section icons: size to 10pt heading (not rem), vertically centered with caps — avoids oversized icon vs SUMMARY text */
  const sectionHeadingPt = 10;
  const sectionHeadingEmMm = ptToMm(sectionHeadingPt);
  const sectionIconSizeMm = sectionHeadingEmMm * 1.2;
  const sectionIconGapMm = Math.min(0.4 * rem, sectionHeadingEmMm * 0.32);
  /* Icon-only vertical nudge (mm). Does not move section title or rule line — use + down, − up */
  const sectionIconOffsetYMm = -0.5;

  const drawPageBackground = () => {
    if (!backgroundDataUrl) return;
    try {
      pdf.addImage(backgroundDataUrl, 'PNG', 0, 0, pageW, pageH);
    } catch (e) {
      console.warn('PDF background image skipped:', e);
    }
  };

  drawPageBackground();

  const contactPrimary = [resume.email, resume.phone, resume.location].filter(Boolean).join(' · ');
  const hasContactBlock = Boolean(
    contactPrimary || resume.linkedIn?.trim() || resume.github?.trim(),
  );

  const ensureSpace = (needMm) => {
    if (y + needMm > bottomLimit) {
      pdf.addPage();
      drawPageBackground();
      y = marginY;
    }
  };

  const writeWrapped = (text, fontSize, options = {}) => {
    const {
      style = 'normal',
      color = [31, 41, 55],
      leadingMult = 1.45, /* .karon-page line-height */
      spaceAfter = 1.2,
      maxWidth = maxW,
      x0 = marginX,
    } = options;
    pdf.setCharSpace(0);
    pdf.setFont('helvetica', style);
    pdf.setFontSize(fontSize);
    pdf.setTextColor(color[0], color[1], color[2]);
    const lines = pdf.splitTextToSize(pdfSafeText(text) || '', maxWidth);
    const lh = ptToMm(fontSize) * leadingMult;
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(lh);
      pdf.text(lines[i], x0, y, { baseline: 'top' });
      y += lh;
    }
    y += spaceAfter;
  };

  writeWrapped(resume.fullName || 'Your name', 22, {
    style: 'bold',
    color: [13, 148, 136], /* #0d9488 — match Summary heading */
    spaceAfter: h1After,
    leadingMult: 1.12,
  });

  if (hasContactBlock) {
    const lhContact = ptToMm(9) * 1.45;
    ensureSpace(lhContact);
    y = writePdfContactSection(pdf, resume, y, marginX, maxW, 9, 1.45, ensureSpace, ptToMm);
  }
  if (hasContactBlock) {
    y += contactPadBottom;
    ensureSpace(1);
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth((1 / 96) * 25.4); /* 1px #e5e7eb */
    pdf.line(marginX, y, pageW - marginX, y);
    y += contactBlockBottom;
  }

  const sectionRule = (title) => {
    ensureSpace(8);
    const iconKey = pdfSectionIconKey(title);
    const iconTop =
      y +
      (sectionHeadingEmMm - sectionIconSizeMm) / 2 +
      sectionHeadingEmMm * 0.065 +
      sectionIconOffsetYMm;
    if (iconKey) {
      drawPdfSectionIcon(pdf, iconKey, marginX, iconTop, sectionIconSizeMm);
    }
    const textX = marginX + (iconKey ? sectionIconSizeMm + sectionIconGapMm : 0);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(sectionHeadingPt);
    if (SECTION_TITLE_TEAL.test(String(title).trim())) {
      pdf.setTextColor(13, 148, 136);
    } else {
      pdf.setTextColor(55, 65, 81);
    }
    const upper = title.toUpperCase();
    pdf.text(upper, textX, y, { baseline: 'top', charSpace: sectionTitleCharSpace });
    const tw =
      pdf.getTextWidth(upper) +
      (upper.length > 1 ? (upper.length - 1) * (sectionTitleCharSpace / 72) * 25.4 : 0);
    pdf.setCharSpace(0);

    pdf.setDrawColor(13, 148, 136);
    pdf.setLineWidth(sectionRuleLineMm);
    const capMm = sectionHeadingEmMm;
    /* Rule Y from title only — icon spacing is adjusted via sectionIconOffsetYMm / sectionIconSizeMm */
    const lineY = y + capMm * 0.88 + headingPadBelowText;
    const lineEnd = Math.min(textX + tw + 0.35, marginX + maxW);
    pdf.line(marginX, lineY, lineEnd, lineY);
    y = lineY + sectionRuleLineMm * 0.5 + headingBelowRule;
  };

  if (resume.summary?.trim()) {
    sectionRule('Summary');
    writeWrapped(resume.summary, 9.5, {
      color: [55, 65, 81],
      spaceAfter: blockGap,
      leadingMult: 1.45,
    });
  }

  const hasEdu = resume.education?.some((e) => e.school || e.degree);
  if (hasEdu) {
    sectionRule('Education');
    let eduRows = 0;
    for (const row of resume.education) {
      if (!row.school && !row.degree) continue;
      eduRows += 1;
      const title = [row.school, row.degree].filter(Boolean).join(' — ') || 'Education';
      const period = row.period || '';
      const titleMaxW = period ? maxW - 38 : maxW;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(17, 24, 39);
      const eduLines = pdf.splitTextToSize(pdfSafeText(title), titleMaxW);
      const lh = ptToMm(10) * 1.45;
      for (let i = 0; i < eduLines.length; i++) {
        ensureSpace(lh);
        pdf.text(eduLines[i], marginX, y, { baseline: 'top' });
        if (i === 0 && period) {
          const periodSafe = pdfSafeText(period);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(107, 114, 128);
          const pw = pdf.getTextWidth(periodSafe);
          pdf.text(periodSafe, pageW - marginX - pw, y, { baseline: 'top' });
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(17, 24, 39);
        }
        y += lh;
      }
      y += itemGap;
    }
    if (eduRows > 0) {
      y -= itemGap;
      y += blockGap;
    }
  }

  if (KARON_FIXED_CERTIFICATES.length) {
    sectionRule('Certifications');
    const certFs = 9.5;
    const certLh = ptToMm(certFs) * 1.45;
    const certLabelColW = 44;
    const certUrlX = marginX + certLabelColW;
    const certUrlW = Math.max(12, maxW - certLabelColW);
    for (const cert of KARON_FIXED_CERTIFICATES) {
      const title = pdfSafeText(cert.title);
      const url = pdfSafeText(cert.url);
      const absUrl = pdfAbsLinkUrl(cert.url);
      const label = `${title}:`;
      ensureSpace(certLh);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(certFs);
      pdf.setTextColor(55, 65, 81);
      pdf.text(label, marginX, y, { baseline: 'top' });
      const firstLine = (pdf.splitTextToSize(url, certUrlW) || [url])[0];
      pdf.setTextColor(59, 130, 246);
      pdf.text(firstLine, certUrlX, y, { baseline: 'top' });
      const firstLineW = pdf.getTextWidth(firstLine);
      try {
        pdf.link(certUrlX, y, firstLineW, certLh, { url: absUrl });
      } catch {
        /* ignore invalid links */
      }
      y += certLh;
    }
    y += blockGap;
  }

  const hasExp = resume.experience?.some((e) => e.title || e.company || e.details);
  if (hasExp) {
    sectionRule('Experience');
    let expRows = 0;
    for (const row of resume.experience) {
      if (!row.title && !row.company && !row.details) continue;
      expRows += 1;
      const title = [row.title, row.company].filter(Boolean).join(' — ') || 'Role';
      const period = row.period || '';
      const titleMaxW = period ? maxW - 38 : maxW;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(17, 24, 39);
      const titleLines = pdf.splitTextToSize(pdfSafeText(title), titleMaxW);
      const lh = ptToMm(10) * 1.45;
      for (let i = 0; i < titleLines.length; i++) {
        ensureSpace(lh);
        pdf.text(titleLines[i], marginX, y, { baseline: 'top' });
        if (i === 0 && period) {
          const periodSafe = pdfSafeText(period);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(107, 114, 128);
          const pw = pdf.getTextWidth(periodSafe);
          pdf.text(periodSafe, pageW - marginX - pw, y, { baseline: 'top' });
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(17, 24, 39);
        }
        y += lh;
      }
      if (row.details?.trim()) {
        y += itemBodyTop;
        const paras = row.details.split('\n');
        for (const p of paras) {
          if (!p.trim()) continue;
          writeWrapped(p.trim(), 9.5, {
            color: [75, 85, 99],
            spaceAfter: 1,
            leadingMult: 1.45,
          });
        }
      }
      y += itemGap;
    }
    if (expRows > 0) {
      y -= itemGap;
      y += blockGap;
    }
  }

  const hasProjects = resume.projects?.some((p) => p.name || p.tech || p.details);
  if (hasProjects) {
    sectionRule('Projects');
    let projRows = 0;
    for (const row of resume.projects) {
      if (!row.name && !row.tech && !row.details) continue;
      projRows += 1;
      const title = [row.name, row.tech].filter(Boolean).join(' — ') || 'Project';
      const period = row.period || '';
      const titleMaxW = period ? maxW - 38 : maxW;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(17, 24, 39);
      const titleLines = pdf.splitTextToSize(pdfSafeText(title), titleMaxW);
      const lh = ptToMm(10) * 1.45;
      for (let i = 0; i < titleLines.length; i++) {
        ensureSpace(lh);
        pdf.text(titleLines[i], marginX, y, { baseline: 'top' });
        if (i === 0 && period) {
          const periodSafe = pdfSafeText(period);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(107, 114, 128);
          const pw = pdf.getTextWidth(periodSafe);
          pdf.text(periodSafe, pageW - marginX - pw, y, { baseline: 'top' });
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(17, 24, 39);
        }
        y += lh;
      }
      if (row.details?.trim()) {
        y += itemBodyTop;
        const paras = row.details.split('\n');
        for (const p of paras) {
          if (!p.trim()) continue;
          writeWrapped(p.trim(), 9.5, {
            color: [75, 85, 99],
            spaceAfter: 1,
            leadingMult: 1.45,
          });
        }
      }
      y += itemGap;
    }
    if (projRows > 0) {
      y -= itemGap;
      y += blockGap;
    }
  }

  if (resume.certifications?.trim()) {
    sectionRule('Certifications');
    writeWrapped(resume.certifications, 9.5, {
      color: [55, 65, 81],
      spaceAfter: blockGap,
      leadingMult: 1.45,
    });
  }

  if (resume.skills?.trim()) {
    sectionRule('Skills');
    writeWrapped(resume.skills, 9.5, {
      color: [55, 65, 81],
      spaceAfter: 0,
      leadingMult: 1.45,
    });
  }

  const fileStem =
    String(resume.fullName || 'resume')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'resume';
  pdf.save(`${fileStem}.pdf`);
}

const defaultResume = {
  fullName: 'Jordan Karon',
  email: 'hello@example.com',
  phone: '+1 555 0100',
  location: 'San Francisco, CA',
  linkedIn: '',
  github: '',
  summary:
    'Designer–developer hybrid focused on clear UX and polished interfaces. Experienced shipping web apps from concept to production.',
  experience: [
    {
      id: newId(),
      company: 'Acme Labs',
      title: 'Senior Product Designer',
      period: '2022 — Present',
      details:
        '• Led redesign of core dashboard; +18% task completion.\n• Built design system in Figma; dev handoff in React.\n• Mentored two junior designers.',
    },
    {
      id: newId(),
      company: 'Northwind Studio',
      title: 'UX Designer',
      period: '2019 — 2022',
      details:
        '• User research, prototyping, and usability testing.\n• Collaborated with engineers on accessibility (WCAG 2.1 AA).',
    },
  ],
  education: [
    {
      id: newId(),
      school: 'State University',
      degree: 'B.S. Human–Computer Interaction',
      period: '2015 — 2019',
    },
  ],
  skills: 'Figma · React · Design systems · User research · Prototyping · HTML/CSS',
  certifications: '',
  projects: [
    {
      id: newId(),
      name: 'Portfolio & resume builder',
      tech: 'React · jsPDF',
      period: '2025',
      details: '• Live A4 preview with PDF export.\n• Structured sections for experience and education.',
    },
  ],
};

const emptyResume = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  linkedIn: '',
  github: '',
  summary: '',
  experience: [],
  projects: [],
  education: [],
  skills: '',
};

function countPdfImportFields(parsed) {
  let n = 0;
  if (parsed.fullName) n += 1;
  if (parsed.email) n += 1;
  if (parsed.phone) n += 1;
  if (parsed.location) n += 1;
  if (parsed.linkedIn) n += 1;
  if (parsed.github) n += 1;
  if (parsed.summary) n += 1;
  if (parsed.skills) n += 1;
  if (parsed.certifications) n += 1;
  n += parsed.experience?.length || 0;
  n += parsed.projects?.length || 0;
  n += parsed.education?.length || 0;
  return n;
}

function KaronTemplate({ brandName = 'Karon', middlewarePath = '/karon' } = {}) {
  const location = useLocation();
  const uploadedFile = location.state?.uploadedFile;
  const uploadedFileName = location.state?.uploadedFileName;
  const isPdfUpload =
    uploadedFile instanceof File &&
    (uploadedFile.type === 'application/pdf' || uploadedFile.name?.toLowerCase().endsWith('.pdf'));

  const [data, setData] = useState(() => (isPdfUpload ? { ...emptyResume } : defaultResume));
  /** null = no PDF upload; undefined = PDF loading; string = raw extracted text from the file */
  const [pdfRawText, setPdfRawText] = useState(() => (isPdfUpload ? undefined : null));
  const [pdfBusy, setPdfBusy] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const previewRef = useRef(null);
  const inputRef = useRef(null);
  const pdfLockRef = useRef(false);
  const pdfImportDoneRef = useRef(false);

  useEffect(() => {
    const file = uploadedFile instanceof File ? uploadedFile : null;
    const isPdf =
      file &&
      (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf'));
    if (!isPdf || pdfImportDoneRef.current) return;
    pdfImportDoneRef.current = true;
    let cancelled = false;
    setImportStatus('Reading PDF…');
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        if (cancelled) return;
        const extracted = await extractTextAndLinksFromPdfWithTimeout(buf);
        if (cancelled) return;
        const text = extracted?.text ?? '';
        setPdfRawText(text);
        const parsed = parseResumeFromPdfText(text);
        const linkedIn =
          (extracted?.linkedInFromAnnotations && String(extracted.linkedInFromAnnotations).trim()) ||
          parsed.linkedIn ||
          '';
        const github =
          (extracted?.githubFromAnnotations && String(extracted.githubFromAnnotations).trim()) ||
          parsed.github ||
          '';
        const mergedForCount = { ...parsed, linkedIn, github };
        if (cancelled) return;
        setData({
          ...emptyResume,
          fullName: parsed.fullName || '',
          email: parsed.email || '',
          phone: parsed.phone || '',
          location: parsed.location || '',
          linkedIn,
          github,
          summary: parsed.summary || '',
          skills: parsed.skills || '',
          experience: (parsed.experience || []).map((row) => ({
            id: newId(),
            title: row.title || '',
            company: row.company || '',
            period: row.period || '',
            details: row.details || '',
          })),
          projects: (parsed.projects || []).map((row) => ({
            id: newId(),
            name: row.name || '',
            tech: row.tech || '',
            period: row.period || '',
            details: row.details || '',
          })),
          education: (parsed.education || []).map((row) => ({
            id: newId(),
            school: row.school || '',
            degree: row.degree || '',
            period: row.period || '',
          })),
        });
        const filled = countPdfImportFields(mergedForCount);
        setImportStatus(
          filled > 0
            ? `Loaded ${filled} field${filled === 1 ? '' : 's'} from PDF — review below`
            : 'No text found in PDF (try a text-based PDF, not a scan)',
        );
      } catch (e) {
        console.error(e);
        setPdfRawText('');
        const msg = e instanceof Error && e.message.includes('timed out')
          ? 'PDF timed out — check network or try a smaller file'
          : 'PDF import failed — edit fields manually';
        setImportStatus(msg);
      }
    })();
    return () => {
      cancelled = true;
      pdfImportDoneRef.current = false;
    };
  }, [uploadedFile]);

  const updateField = useCallback((key, value) => {
    setData((d) => ({ ...d, [key]: value }));
  }, []);

  const updateExp = useCallback((id, key, value) => {
    setData((d) => ({
      ...d,
      experience: d.experience.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    }));
  }, []);

  const addExperience = useCallback(() => {
    setData((d) => ({
      ...d,
      experience: [
        ...d.experience,
        { id: newId(), company: '', title: '', period: '', details: '' },
      ],
    }));
  }, []);

  const removeExperience = useCallback((id) => {
    setData((d) => ({
      ...d,
      experience: d.experience.filter((row) => row.id !== id),
    }));
  }, []);

  const updateProject = useCallback((id, key, value) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    }));
  }, []);

  const addProject = useCallback(() => {
    setData((d) => ({
      ...d,
      projects: [
        ...d.projects,
        { id: newId(), name: '', tech: '', period: '', details: '' },
      ],
    }));
  }, []);

  const removeProject = useCallback((id) => {
    setData((d) => ({
      ...d,
      projects: d.projects.filter((row) => row.id !== id),
    }));
  }, []);

  const updateEdu = useCallback((id, key, value) => {
    setData((d) => ({
      ...d,
      education: d.education.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    }));
  }, []);

  const addEducation = useCallback(() => {
    setData((d) => ({
      ...d,
      education: [
        ...d.education,
        { id: newId(), school: '', degree: '', period: '' },
      ],
    }));
  }, []);

  const removeEducation = useCallback((id) => {
    setData((d) => ({
      ...d,
      education: d.education.filter((row) => row.id !== id),
    }));
  }, []);



  const ACCEPT =
    '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const pickFiles = useCallback(
    (files) => {
      const next = files && files[0];
      if (next) {
        setShowUploadModal(false);
        setDragOver(false);
        // Process the file
        const isPdf = next.type === 'application/pdf' || next.name?.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          pdfImportDoneRef.current = false;
          setImportStatus('Reading PDF…');
          (async () => {
            try {
              const buf = await next.arrayBuffer();
              const extracted = await extractTextAndLinksFromPdfWithTimeout(buf);
              const text = extracted?.text ?? '';
              setPdfRawText(text);
              const parsed = parseResumeFromPdfText(text);
              const linkedIn =
                (extracted?.linkedInFromAnnotations && String(extracted.linkedInFromAnnotations).trim()) ||
                parsed.linkedIn ||
                '';
              const github =
                (extracted?.githubFromAnnotations && String(extracted.githubFromAnnotations).trim()) ||
                parsed.github ||
                '';
              const mergedForCount = { ...parsed, linkedIn, github };
              setData({
                ...emptyResume,
                fullName: parsed.fullName || '',
                email: parsed.email || '',
                phone: parsed.phone || '',
                linkedIn,
                github,
                location: parsed.location || '',
                website: parsed.website || '',
                summary: parsed.summary || '',
                skills: parsed.skills || '',
                experience: (parsed.experience || []).map((row) => ({
                  id: newId(),
                  title: row.title || '',
                  company: row.company || '',
                  period: row.period || '',
                  location: row.location || '',
                  details: row.details || '',
                })),
                education: (parsed.education || []).map((row) => ({
                  id: newId(),
                  school: row.school || '',
                  degree: row.degree || '',
                  period: row.period || '',
                  location: row.location || '',
                  details: row.details || '',
                })),
                volunteerExperience: (parsed.volunteerExperience || []).map((row) => ({
                  id: newId(),
                  title: row.title || '',
                  organization: row.organization || '',
                  period: row.period || '',
                  location: row.location || '',
                  details: row.details || '',
                })),
                projects: (parsed.projects || []).map((row) => ({
                  id: newId(),
                  name: row.name || '',
                  tech: row.tech || '',
                  period: row.period || '',
                  details: row.details || '',
                })),
              });
              const filled = countPdfImportFields(mergedForCount);
              setImportStatus(
                filled > 0
                  ? `Loaded ${filled} field${filled === 1 ? '' : 's'} from PDF — review below`
                  : 'No text found in PDF (try a text-based PDF, not a scan)',
              );
            } catch (e) {
              console.error(e);
              setPdfRawText('');
              const msg =
                e instanceof Error && e.message.includes('timed out')
                  ? 'PDF timed out — check network or try a smaller file'
                  : 'PDF import failed — edit fields manually';
              setImportStatus(msg);
            }
          })();
        }
      }
    },
    [],
  );

  const onInputChange = useCallback(
    (e) => {
      pickFiles(e.target.files);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [pickFiles],
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      pickFiles(e.dataTransfer.files);
    },
    [pickFiles],
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const downloadPdf = useCallback(async () => {
    if (pdfLockRef.current) return;
    pdfLockRef.current = true;
    setPdfBusy(true);
    try {
      const bg = await loadPdfBackgroundDataUrl();
      buildEditableResumePdf(data, bg);
    } catch (e) {
      console.error(e);
      window.alert('Could not create PDF. Try again or use Print to PDF from your browser.');
    } finally {
      pdfLockRef.current = false;
      setPdfBusy(false);
    }
  }, [data]);

  const contactPrimary = [data.email, data.phone, data.location].filter(Boolean).join(' · ');
  const hasPreviewSocial = Boolean(data.linkedIn?.trim() || data.github?.trim());

  return (
    <div className="karon-editor">
      <header className="karon-toolbar">
        <div className="karon-toolbar__brand">
          <strong>{brandName}</strong>
          <span>Resume editor</span>
          {uploadedFileName ? (
            <span className="karon-toolbar__uploaded" title={uploadedFileName}>
              File: {uploadedFileName}
              {importStatus ? ` · ${importStatus}` : ''}
            </span>
          ) : null}
        </div>
        <div className="karon-toolbar__actions">
          <button
            type="button"
            className="karon-btn karon-btn--ghost"
            onClick={() => setShowUploadModal(true)}
          >
            Upload
          </button>
          <Link className="karon-btn karon-btn--ghost" to="/templates">
            Home
          </Link>
          <button
            type="button"
            className="karon-btn karon-btn--primary"
            onClick={downloadPdf}
            disabled={pdfBusy}
          >
            {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      </header>

      <div className="karon-layout">
        <aside className="karon-sidebar">
          <p className="karon-sidebar__hint">
            Edit sections on the left — the A4 preview updates live. Export matches the preview (similar flow to{' '}
            <a
              href="https://app.enhancv.com/resume/new"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#0d9488' }}
            >
              Enhancv
            </a>
            -style builders).
          </p>

          {pdfRawText !== null ? (
            <div className="karon-section karon-pdf-raw">
              <h3 className="karon-section__title">Text from your PDF</h3>
              <p className="karon-pdf-raw__hint">
                Identified text from the uploaded file. Fields below are filled from this; you can compare or copy from here.
              </p>
              {pdfRawText === undefined ? (
                <p className="karon-pdf-raw__loading">Reading and identifying text…</p>
              ) : (
                <textarea
                  className="karon-pdf-raw__textarea"
                  readOnly
                  value={pdfRawText}
                  placeholder="No text layer in this PDF (try a text-based export, not a scan)."
                  rows={12}
                  spellCheck={false}
                  aria-label="Text extracted from PDF"
                />
              )}
            </div>
          ) : null}

          <div className="karon-section">
            <h3 className="karon-section__title">Profile</h3>
            <div className="karon-field">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                value={data.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="karon-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={data.email}
                onChange={(e) => updateField('email', e.target.value)}
              />
            </div>
            <div className="karon-field">
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                value={data.phone}
                onChange={(e) => updateField('phone', e.target.value)}
              />
            </div>
            <div className="karon-field">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                value={data.location}
                onChange={(e) => updateField('location', e.target.value)}
              />
            </div>
            <div className="karon-field">
              <label htmlFor="linkedIn">LinkedIn</label>
              <input
                id="linkedIn"
                type="url"
                inputMode="url"
                placeholder="https://linkedin.com/in/…"
                value={data.linkedIn}
                onChange={(e) => updateField('linkedIn', e.target.value)}
                autoComplete="url"
              />
            </div>
            <div className="karon-field">
              <label htmlFor="github">GitHub</label>
              <input
                id="github"
                type="url"
                inputMode="url"
                placeholder="https://github.com/…"
                value={data.github}
                onChange={(e) => updateField('github', e.target.value)}
                autoComplete="url"
              />
            </div>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title karon-section__title--with-icon">
              <SummarySectionIcon className="karon-section__title-icon" />
              Summary
            </h3>
            <div className="karon-field">
              <label htmlFor="summary">About you</label>
              <textarea
                id="summary"
                value={data.summary}
                onChange={(e) => updateField('summary', e.target.value)}
                rows={5}
              />
            </div>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title karon-section__title--with-icon">
              <ExperienceSectionIcon className="karon-section__title-icon" />
              Experience
            </h3>
            {data.experience.map((row) => (
              <div key={row.id} className="karon-subcard">
                <div className="karon-field">
                  <label>Job title</label>
                  <input
                    value={row.title}
                    onChange={(e) => updateExp(row.id, 'title', e.target.value)}
                  />
                </div>
                <div className="karon-field">
                  <label>Company</label>
                  <input
                    value={row.company}
                    onChange={(e) => updateExp(row.id, 'company', e.target.value)}
                  />
                </div>
                <div className="karon-field">
                  <label>Dates</label>
                  <input
                    value={row.period}
                    onChange={(e) => updateExp(row.id, 'period', e.target.value)}
                    placeholder="2020 — Present"
                  />
                </div>
                <div className="karon-field">
                  <label>Details (one bullet per line)</label>
                  <textarea
                    value={row.details}
                    onChange={(e) => updateExp(row.id, 'details', e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="karon-row-actions">
                  <button
                    type="button"
                    className="karon-btn karon-btn--small karon-btn--danger"
                    onClick={() => removeExperience(row.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="karon-btn karon-btn--ghost" onClick={addExperience}>
              + Add experience
            </button>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title karon-section__title--with-icon">
              <ProjectsSectionIcon className="karon-section__title-icon" />
              Projects
            </h3>
            {data.projects.map((row) => (
              <div key={row.id} className="karon-subcard">
                <div className="karon-field">
                  <label>Project name</label>
                  <input
                    value={row.name}
                    onChange={(e) => updateProject(row.id, 'name', e.target.value)}
                  />
                </div>
                <div className="karon-field">
                  <label>Tech / stack (optional)</label>
                  <input
                    value={row.tech}
                    onChange={(e) => updateProject(row.id, 'tech', e.target.value)}
                    placeholder="e.g. React · Node.js"
                  />
                </div>
                <div className="karon-field">
                  <label>Dates (optional)</label>
                  <input
                    value={row.period}
                    onChange={(e) => updateProject(row.id, 'period', e.target.value)}
                    placeholder="2024 — Present"
                  />
                </div>
                <div className="karon-field">
                  <label>Details (one bullet per line)</label>
                  <textarea
                    value={row.details}
                    onChange={(e) => updateProject(row.id, 'details', e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="karon-row-actions">
                  <button
                    type="button"
                    className="karon-btn karon-btn--small karon-btn--danger"
                    onClick={() => removeProject(row.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="karon-btn karon-btn--ghost" onClick={addProject}>
              + Add project
            </button>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title karon-section__title--with-icon">
              <EducationSectionIcon className="karon-section__title-icon" />
              Education
            </h3>
            {data.education.map((row) => (
              <div key={row.id} className="karon-subcard">
                <div className="karon-field">
                  <label>School</label>
                  <input
                    value={row.school}
                    onChange={(e) => updateEdu(row.id, 'school', e.target.value)}
                  />
                </div>
                <div className="karon-field">
                  <label>Degree / program</label>
                  <input
                    value={row.degree}
                    onChange={(e) => updateEdu(row.id, 'degree', e.target.value)}
                  />
                </div>
                <div className="karon-field">
                  <label>Dates</label>
                  <input
                    value={row.period}
                    onChange={(e) => updateEdu(row.id, 'period', e.target.value)}
                  />
                </div>
                <div className="karon-row-actions">
                  <button
                    type="button"
                    className="karon-btn karon-btn--small karon-btn--danger"
                    onClick={() => removeEducation(row.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="karon-btn karon-btn--ghost" onClick={addEducation}>
              + Add education
            </button>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title karon-section__title--with-icon">
              <CertificationsSectionIcon className="karon-section__title-icon" />
              Certifications
            </h3>
            <div className="karon-field">
              <label htmlFor="certifications">Licenses &amp; certificates (one per line or bullets)</label>
              <textarea
                id="certifications"
                value={data.certifications}
                onChange={(e) => updateField('certifications', e.target.value)}
                rows={4}
                placeholder="e.g. AWS Solutions Architect · PMP"
              />
            </div>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title karon-section__title--with-icon">
              <SkillsSectionIcon className="karon-section__title-icon" />
              Skills
            </h3>
            <div className="karon-field">
              <label htmlFor="skills">Skills (separate with · or commas)</label>
              <textarea
                id="skills"
                value={data.skills}
                onChange={(e) => updateField('skills', e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </aside>

        <div className="karon-preview-wrap">
          <article className="karon-page" ref={previewRef}>
            <h1>{data.fullName || 'Your name'}</h1>
            {contactPrimary || hasPreviewSocial ? (
              <p className="karon-preview-contact">
                {contactPrimary ? (
                  <>
                    {contactPrimary}
                    {hasPreviewSocial ? <span className="karon-preview-contact__sep"> · </span> : null}
                  </>
                ) : null}
                {data.linkedIn?.trim() ? (
                  <a
                    className="karon-preview-contact__link"
                    href={pdfAbsLinkUrl(data.linkedIn)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    LinkedIn
                  </a>
                ) : null}
                {data.linkedIn?.trim() && data.github?.trim() ? (
                  <span className="karon-preview-contact__sep"> · </span>
                ) : null}
                {data.github?.trim() ? (
                  <a
                    className="karon-preview-contact__link"
                    href={pdfAbsLinkUrl(data.github)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub
                  </a>
                ) : null}
              </p>
            ) : null}

            {data.summary?.trim() ? (
              <div className="karon-preview-block">
                <div className="karon-preview-block__heading">
                  <SummarySectionIcon className="karon-preview-heading-icon" />
                  <h2>Summary</h2>
                </div>
                <p className="karon-preview-summary">{data.summary}</p>
              </div>
            ) : null}

            {data.education.some((e) => e.school || e.degree) ? (
              <div className="karon-preview-block">
                <div className="karon-preview-block__heading">
                  <EducationSectionIcon className="karon-preview-heading-icon" />
                  <h2>Education</h2>
                </div>
                {data.education.map((row) =>
                  row.school || row.degree ? (
                    <div key={row.id} className="karon-preview-item">
                      <div className="karon-preview-item__top">
                        <span className="karon-preview-item__title">
                          {[row.school, row.degree].filter(Boolean).join(' — ') || 'Education'}
                        </span>
                        {row.period ? (
                          <span className="karon-preview-item__meta">{row.period}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            ) : null}

            {KARON_FIXED_CERTIFICATES.length ? (
              <div className="karon-preview-block">
                <div className="karon-preview-block__heading">
                  <CertificationsSectionIcon className="karon-preview-heading-icon" />
                  <h2>Certifications</h2>
                </div>
                {KARON_FIXED_CERTIFICATES.map((cert) => (
                  <div key={cert.url} className="karon-preview-item">
                    <p className="karon-preview-summary karon-preview-cert-line">
                      <span className="karon-preview-cert-line__label">{cert.title}:</span>
                      <a
                        className="karon-preview-contact__link karon-preview-cert-line__link"
                        href={pdfAbsLinkUrl(cert.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {cert.url}
                      </a>
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {data.experience.some((e) => e.title || e.company || e.details) ? (
              <div className="karon-preview-block">
                <div className="karon-preview-block__heading">
                  <ExperienceSectionIcon className="karon-preview-heading-icon" />
                  <h2>Experience</h2>
                </div>
                {data.experience.map((row) =>
                  row.title || row.company || row.details ? (
                    <div key={row.id} className="karon-preview-item">
                      <div className="karon-preview-item__top">
                        <span className="karon-preview-item__title">
                          {[row.title, row.company].filter(Boolean).join(' — ') || 'Role'}
                        </span>
                        {row.period ? (
                          <span className="karon-preview-item__meta">{row.period}</span>
                        ) : null}
                      </div>
                      {row.details?.trim() ? (
                        <p className="karon-preview-item__body">{row.details}</p>
                      ) : null}
                    </div>
                  ) : null,
                )}
              </div>
            ) : null}

            {data.projects.some((p) => p.name || p.tech || p.details) ? (
              <div className="karon-preview-block">
                <div className="karon-preview-block__heading">
                  <ProjectsSectionIcon className="karon-preview-heading-icon" />
                  <h2>Projects</h2>
                </div>
                {data.projects.map((row) =>
                  row.name || row.tech || row.details ? (
                    <div key={row.id} className="karon-preview-item">
                      <div className="karon-preview-item__top">
                        <span className="karon-preview-item__title">
                          {[row.name, row.tech].filter(Boolean).join(' — ') || 'Project'}
                        </span>
                        {row.period ? (
                          <span className="karon-preview-item__meta">{row.period}</span>
                        ) : null}
                      </div>
                      {row.details?.trim() ? (
                        <p className="karon-preview-item__body">{row.details}</p>
                      ) : null}
                    </div>
                  ) : null,
                )}
              </div>
            ) : null}

            {data.skills?.trim() ? (
              <div className="karon-preview-block">
                <div className="karon-preview-block__heading">
                  <SkillsSectionIcon className="karon-preview-heading-icon" />
                  <h2>Skills</h2>
                </div>
                <p className="karon-preview-skills">{data.skills}</p>
              </div>
            ) : null}
          </article>
        </div>
      </div>

      {showUploadModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowUploadModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>Upload Resume</h2>
            <div
              className={`karon-mw__drop${dragOver ? ' karon-mw__drop--active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              style={{ marginBottom: '20px', textAlign: 'center' }}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={onInputChange}
              />
              <svg
                className="karon-mw__drop-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="karon-mw__drop-title">Upload your resume</p>
              <p className="karon-mw__drop-hint">Drag and drop a file here, or choose from your device</p>
              <button
                type="button"
                className="karon-mw__btn-upload"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                Choose file
              </button>
              <p className="karon-mw__file-types">PDF, DOC, or DOCX · Max size depends on your browser</p>
            </div>
            <button
              type="button"
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              onClick={() => setShowUploadModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default KaronTemplate;
