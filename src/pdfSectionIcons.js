/**
 * Vector section icons for jsPDF export (match Karon preview SVGs; teal stroke).
 * Coordinates use a 0–24 viewBox scaled into sizeMm at (x0, y0).
 */

const TEAL = [13, 148, 136];

/** @param {import('jspdf').jsPDF} pdf */
function strokeIcon(pdf, x0, y0, s, draw) {
  pdf.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
  /* Slightly heavier stroke so vector icons read closer to bold 10pt section titles in PDF */
  pdf.setLineWidth(Math.max(0.1, Math.min(0.16, s * 0.038)));
  pdf.setLineCap('round');
  pdf.setLineJoin('round');
  const X = (nx) => x0 + (nx / 24) * s;
  const Y = (ny) => y0 + (ny / 24) * s;
  const line = (x1, y1, x2, y2) => pdf.line(X(x1), Y(y1), X(x2), Y(y2));
  draw(pdf, line, X, Y, x0, y0, s);
}

/**
 * @param {import('jspdf').jsPDF} pdf
 * @param {'summary'|'experience'|'projects'|'education'|'certifications'|'skills'} kind
 */
export function drawPdfSectionIcon(pdf, kind, x0, y0, s) {
  switch (kind) {
    case 'summary':
      strokeIcon(pdf, x0, y0, s, (_pdf, line) => {
        line(6, 3, 6, 20);
        line(6, 20, 18, 20);
        line(18, 20, 18, 8);
        line(18, 8, 14, 3);
        line(14, 3, 6, 3);
        line(8, 8, 12, 8);
        line(8, 11, 16, 11);
        line(8, 14, 16, 14);
      });
      break;
    case 'experience':
      strokeIcon(pdf, x0, y0, s, (pdfDoc, line, _X, _Y, ox, oy, sz) => {
        const rx = Math.max(0.12, Math.min(0.45, sz * 0.08));
        pdfDoc.roundedRect(
          ox + (2 / 24) * sz,
          oy + (7 / 24) * sz,
          (20 / 24) * sz,
          (14 / 24) * sz,
          rx,
          rx,
          'S',
        );
        line(9, 7, 9, 5);
        line(9, 5, 15, 5);
        line(15, 5, 15, 7);
      });
      break;
    case 'projects':
      strokeIcon(pdf, x0, y0, s, (_pdf, line) => {
        line(12, 2, 2, 7);
        line(2, 7, 12, 12);
        line(12, 12, 22, 7);
        line(22, 7, 12, 2);
        line(2, 17, 12, 22);
        line(12, 22, 22, 17);
        line(2, 12, 12, 17);
        line(12, 17, 22, 12);
      });
      break;
    case 'education':
      strokeIcon(pdf, x0, y0, s, (_pdf, line) => {
        line(2, 3, 8, 3);
        line(8, 3, 11, 7);
        line(11, 7, 11, 20);
        line(11, 20, 2, 20);
        line(2, 20, 2, 3);
        line(22, 3, 16, 3);
        line(16, 3, 13, 7);
        line(13, 7, 13, 20);
        line(13, 20, 22, 20);
        line(22, 20, 22, 3);
      });
      break;
    case 'certifications':
      strokeIcon(pdf, x0, y0, s, (pdfDoc, line, X, Y) => {
        const cx = X(12);
        const cy = Y(8);
        const rr = (6 / 24) * s;
        pdfDoc.circle(cx, cy, rr, 'S');
        line(15.5, 12.5, 17, 21);
        line(17, 21, 12, 18.5);
        line(12, 18.5, 7, 21);
        line(7, 21, 8.5, 12.5);
      });
      break;
    case 'skills':
      strokeIcon(pdf, x0, y0, s, (_pdf, line) => {
        line(4, 21, 4, 14);
        line(4, 10, 4, 3);
        line(12, 21, 12, 12);
        line(12, 8, 12, 3);
        line(20, 21, 20, 16);
        line(20, 12, 20, 3);
        line(1, 14, 7, 14);
        line(9, 8, 15, 8);
        line(17, 16, 23, 16);
      });
      break;
    default:
      break;
  }
}

export function pdfSectionIconKey(title) {
  const t = String(title).trim().toLowerCase();
  const map = {
    summary: 'summary',
    experience: 'experience',
    projects: 'projects',
    education: 'education',
    certifications: 'certifications',
    skills: 'skills',
  };
  return map[t] || null;
}
