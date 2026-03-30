import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { extractTextAndAnnotationLinksFromPdf, parseResumeFromPdfText } from './resumePdfParse';
import { buildLandryResumePdf, pdfAbsLinkUrl } from './landryPdf';
import { parseEmbeddedJobHeader, parseExperienceDetailSegments } from './experienceDetailSegments';
import { parseLandrySkillRows } from './landrySkillsParse';
import { landryContactPhoneDisplay, landryFormatContactLocation } from './landryContactFormat';
import './KaronTemplate.css';
import './LandryTemplate.css';

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const PDF_TEXT_TIMEOUT_MS = 120_000;

function extractTextAndLinksFromPdfWithTimeout(arrayBuffer, ms = PDF_TEXT_TIMEOUT_MS) {
  return Promise.race([
    extractTextAndAnnotationLinksFromPdf(arrayBuffer),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('PDF text extraction timed out')), ms);
    }),
  ]);
}

const landryEmptyResume = {
  fullName: '',
  headline: '',
  email: '',
  phone: '',
  location: '',
  linkedIn: '',
  github: '',
  summary: '',
  experience: [],
  volunteerExperience: [],
  projects: [],
  education: [],
  skills: '',
  references: '',
};

const defaultLandryResume = {
  fullName: 'Lucas Jackson',
  headline: 'Aspiring Nursing Professional | Healthcare Skills | Patient Care',
  email: 'lucas.jackson@email.com',
  phone: '',
  location: 'San Francisco, California',
  linkedIn: 'https://linkedin.com/in/lucasjackson',
  github: '',
  summary:
    'Motivated nursing graduate with strong foundations in patient assessment, clinical procedures, and interdisciplinary communication. Seeking to contribute in acute and community care settings while pursuing RN licensure.',
  experience: [
    {
      id: newId(),
      company: 'City General Hospital',
      title: 'Lead Senior FullStack Developer',
      period: '01/2021 - 07/2025',
      location: 'San Francisco, CA',
      details:
        '• Collaborated with engineers and product to ship internal clinical tools.\n• Improved reliability of deployment pipelines.',
    },
  ],
  volunteerExperience: [
    {
      id: newId(),
      title: 'Healthcare Volunteer',
      organization: 'California Pacific Medical Center',
      period: '06/2023 - Present',
      location: 'San Francisco, CA',
      details: '• Assisted with patient rounding and family communication.\n• Supported nursing staff with supply organization.',
    },
    {
      id: newId(),
      title: 'Volunteer Caregiver',
      organization: 'Red Cross',
      period: '01/2022 - 05/2023',
      location: 'Oakland, CA',
      details: '• Community health outreach and first-aid education events.',
    },
  ],
  education: [
    {
      id: newId(),
      school: 'San Francisco State University',
      degree: 'Bachelor of Science in Nursing',
      period: '01/2021 - 01/2025',
      location: 'San Francisco, CA',
      details: '• Clinical rotations in med-surg and community health.\n• Dean’s list, Sigma Theta Tau member.',
    },
  ],
  skills:
    'Clinical skills: Patient assessment, Vital signs, Infection control, BLS\nSystems & documentation: Epic EHR, Team communication',
  references: '',
  projects: [],
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
  n += parsed.experience?.length || 0;
  n += parsed.projects?.length || 0;
  n += parsed.education?.length || 0;
  return n;
}

function bulletsFromDetails(details) {  return String(details || '')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

/** Renders experience/project details: bullets + embedded job lines as sub-headers (not bullets). */
function LandryDetailBody({ details }) {
  const segments = parseExperienceDetailSegments(details);
  if (!segments.length) return null;
  const nodes = [];
  let bulletBatch = [];
  let batchKey = 0;

  const flushBullets = () => {
    if (!bulletBatch.length) return;
    nodes.push(
      <ul className="landry-bullets" key={`landry-bul-${batchKey++}`}>
        {bulletBatch.map((t, j) => (
          <li key={j}>{t}</li>
        ))}
      </ul>,
    );
    bulletBatch = [];
  };

  segments.forEach((seg, i) => {
    if (seg.kind === 'header') {
      flushBullets();
      const parsed = parseEmbeddedJobHeader(seg.text);
      nodes.push(
        <div key={`landry-h-${i}`} className="landry-exp__embedded">
          {parsed ? (
            <>
              <div className="landry-exp__head">
                <span className="landry-exp__title">{parsed.title.toUpperCase()}</span>
                <span className="landry-exp__meta">{parsed.period}</span>
              </div>
              {parsed.company ? <div className="landry-exp__company">{parsed.company}</div> : null}
            </>
          ) : (
            <div className="landry-exp__embedded-fallback">{seg.text}</div>
          )}
        </div>,
      );
    } else {
      bulletBatch.push(seg.text);
    }
  });
  flushBullets();
  return <>{nodes}</>;
}

function LandryTimelineRow({ dates, location, children }) {
  return (
    <div className="landry-tl-row">
      <div className="landry-tl-left">
        {dates?.trim() ? <div className="landry-tl-dates">{dates}</div> : null}
        {location?.trim() ? <div className="landry-tl-loc">{location}</div> : null}
      </div>
      <div className="landry-tl-track">
        <div className="landry-tl-dot" />
        <div className="landry-tl-line" />
      </div>
      <div className="landry-tl-body">{children}</div>
    </div>
  );
}

export default function LandryTemplate({ brandName = 'Landry', middlewarePath = '/landry' } = {}) {
  const location = useLocation();
  const uploadedFile = location.state?.uploadedFile;
  const uploadedFileName = location.state?.uploadedFileName;
  const isPdfUpload =
    uploadedFile instanceof File &&
    (uploadedFile.type === 'application/pdf' || uploadedFile.name?.toLowerCase().endsWith('.pdf'));

  const [data, setData] = useState(() => (isPdfUpload ? { ...landryEmptyResume } : defaultLandryResume));
  const [pdfRawText, setPdfRawText] = useState(() => (isPdfUpload ? undefined : null));
  const [pdfBusy, setPdfBusy] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const previewRef = useRef(null);
  const pdfLockRef = useRef(false);
  const pdfImportDoneRef = useRef(false);

  useEffect(() => {
    const file = uploadedFile instanceof File ? uploadedFile : null;
    const isPdf =
      file && (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf'));
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
          ...landryEmptyResume,
          fullName: parsed.fullName || '',
          headline: '',
          email: parsed.email || '',
          phone: parsed.phone || '',
          location: parsed.location || '',
          linkedIn,
          github,
          summary: parsed.summary || '',
          skills: parsed.skills || '',
          references: '',
          volunteerExperience: [],
          experience: (parsed.experience || []).map((row) => ({
            id: newId(),
            title: row.title || '',
            company: row.company || '',
            period: row.period || '',
            location: '',
            details: row.details || '',
          })),
          projects: (parsed.projects || []).map((row) => ({
            id: newId(),
            name: row.name || '',
            tech: row.tech || '',
            period: row.period || '',
            location: '',
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
        { id: newId(), company: '', title: '', period: '', location: '', details: '' },
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
      projects: [...d.projects, { id: newId(), name: '', tech: '', period: '', location: '', details: '' }],
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
        { id: newId(), school: '', degree: '', period: '', location: '', details: '' },
      ],
    }));
  }, []);

  const updateVol = useCallback((id, key, value) => {
    setData((d) => ({
      ...d,
      volunteerExperience: d.volunteerExperience.map((row) =>
        row.id === id ? { ...row, [key]: value } : row,
      ),
    }));
  }, []);

  const addVolunteer = useCallback(() => {
    setData((d) => ({
      ...d,
      volunteerExperience: [
        ...d.volunteerExperience,
        { id: newId(), title: '', organization: '', period: '', location: '', details: '' },
      ],
    }));
  }, []);

  const removeVolunteer = useCallback((id) => {
    setData((d) => ({
      ...d,
      volunteerExperience: d.volunteerExperience.filter((row) => row.id !== id),
    }));
  }, []);

  const removeEducation = useCallback((id) => {
    setData((d) => ({
      ...d,
      education: d.education.filter((row) => row.id !== id),
    }));
  }, []);

  const downloadPdf = useCallback(async () => {
    if (pdfLockRef.current) return;
    pdfLockRef.current = true;
    setPdfBusy(true);
    try {
      await buildLandryResumePdf(data);
    } catch (e) {
      console.error(e);
      window.alert('Could not create PDF. Try again or use Print to PDF from your browser.');
    } finally {
      pdfLockRef.current = false;
      setPdfBusy(false);
    }
  }, [data]);

  const contactLocationDisplay = landryFormatContactLocation(data.location, data.phone);
  const contactPhoneDisplay = landryContactPhoneDisplay(data.phone, contactLocationDisplay);

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
          <Link className="karon-btn karon-btn--ghost" to={middlewarePath}>
            Upload
          </Link>
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
            Landry follows an Enhancv-style timeline layout (forest green accents, vertical timeline).{' '}
            <a
              href="https://app.enhancv.com/resume/new?example=predefined-NnGWboOQRTS1dwTKQMxdcmitQ1h3HTGrypBCQrxF"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4b7e4f' }}
            >
              Example reference
            </a>
          </p>

          {pdfRawText !== null ? (
            <div className="karon-section karon-pdf-raw">
              <h3 className="karon-section__title">Text from your PDF</h3>
              <p className="karon-pdf-raw__hint">
                Identified text from the uploaded file. Fields below are filled from this; you can compare or copy from
                here.
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
              <label htmlFor="landry-fullName">Full name</label>
              <input
                id="landry-fullName"
                value={data.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="karon-field">
              <label htmlFor="landry-headline">Professional headline</label>
              <input
                id="landry-headline"
                value={data.headline}
                onChange={(e) => updateField('headline', e.target.value)}
                placeholder="e.g. Registered Nurse | Med-Surg"
              />
            </div>
            <div className="karon-field">
              <label htmlFor="landry-email">Email</label>
              <input
                id="landry-email"
                type="email"
                value={data.email}
                onChange={(e) => updateField('email', e.target.value)}
              />
            </div>
            <div className="karon-field">
              <label htmlFor="landry-phone">Phone</label>
              <input id="landry-phone" value={data.phone} onChange={(e) => updateField('phone', e.target.value)} />
            </div>
            <div className="karon-field">
              <label htmlFor="landry-location">Location</label>
              <input
                id="landry-location"
                value={data.location}
                onChange={(e) => updateField('location', e.target.value)}
              />
            </div>
            <div className="karon-field">
              <label htmlFor="landry-linkedIn">LinkedIn</label>
              <input
                id="landry-linkedIn"
                type="url"
                inputMode="url"
                placeholder="https://linkedin.com/in/…"
                value={data.linkedIn}
                onChange={(e) => updateField('linkedIn', e.target.value)}
                autoComplete="url"
              />
            </div>
            <div className="karon-field">
              <label htmlFor="landry-github">GitHub (optional)</label>
              <input
                id="landry-github"
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
            <h3 className="karon-section__title">Professional summary</h3>
            <div className="karon-field">
              <label htmlFor="landry-summary">Summary (main column)</label>
              <textarea
                id="landry-summary"
                value={data.summary}
                onChange={(e) => updateField('summary', e.target.value)}
                rows={5}
              />
            </div>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title">Work experience</h3>
            {data.experience.map((row) => (
              <div key={row.id} className="karon-subcard">
                <div className="karon-field">
                  <label>Job title</label>
                  <input value={row.title} onChange={(e) => updateExp(row.id, 'title', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Employer</label>
                  <input value={row.company} onChange={(e) => updateExp(row.id, 'company', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Dates (timeline left)</label>
                  <input
                    value={row.period}
                    onChange={(e) => updateExp(row.id, 'period', e.target.value)}
                    placeholder="01/2021 - 07/2025"
                  />
                </div>
                <div className="karon-field">
                  <label>Location (timeline left)</label>
                  <input
                    value={row.location || ''}
                    onChange={(e) => updateExp(row.id, 'location', e.target.value)}
                    placeholder="San Francisco, CA"
                  />
                </div>
                <div className="karon-field">
                  <label>Bullets (one per line)</label>
                  <p className="karon-pdf-raw__hint" style={{ marginTop: 0, marginBottom: '0.35rem' }}>
                    A line like <strong>Title - Company Aug 2021 - Jul 2025</strong> is treated as a second role, not a
                    bullet.
                  </p>
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
            <h3 className="karon-section__title">Volunteer experience</h3>
            {data.volunteerExperience.map((row) => (
              <div key={row.id} className="karon-subcard">
                <div className="karon-field">
                  <label>Role title</label>
                  <input value={row.title} onChange={(e) => updateVol(row.id, 'title', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Organization</label>
                  <input
                    value={row.organization}
                    onChange={(e) => updateVol(row.id, 'organization', e.target.value)}
                  />
                </div>
                <div className="karon-field">
                  <label>Dates</label>
                  <input value={row.period} onChange={(e) => updateVol(row.id, 'period', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Location</label>
                  <input value={row.location || ''} onChange={(e) => updateVol(row.id, 'location', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Bullets (one per line)</label>
                  <textarea
                    value={row.details}
                    onChange={(e) => updateVol(row.id, 'details', e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="karon-row-actions">
                  <button
                    type="button"
                    className="karon-btn karon-btn--small karon-btn--danger"
                    onClick={() => removeVolunteer(row.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="karon-btn karon-btn--ghost" onClick={addVolunteer}>
              + Add volunteer role
            </button>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title">Education</h3>
            <p className="karon-pdf-raw__hint" style={{ marginTop: 0 }}>
              Timeline left: dates and location. Right: degree (black), school (green), optional bullets.
            </p>
            {data.education.map((row) => (
              <div key={row.id} className="karon-subcard">
                <div className="karon-field">
                  <label>School</label>
                  <input value={row.school} onChange={(e) => updateEdu(row.id, 'school', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Degree</label>
                  <input value={row.degree} onChange={(e) => updateEdu(row.id, 'degree', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Dates (timeline left)</label>
                  <input
                    value={row.period}
                    onChange={(e) => updateEdu(row.id, 'period', e.target.value)}
                    placeholder="01/2021 - 01/2025"
                  />
                </div>
                <div className="karon-field">
                  <label>Location (timeline left)</label>
                  <input
                    value={row.location || ''}
                    onChange={(e) => updateEdu(row.id, 'location', e.target.value)}
                    placeholder="San Francisco, CA"
                  />
                </div>
                <div className="karon-field">
                  <label>Details (optional bullets)</label>
                  <textarea
                    value={row.details || ''}
                    onChange={(e) => updateEdu(row.id, 'details', e.target.value)}
                    rows={3}
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
            <h3 className="karon-section__title">Core skills</h3>
            <div className="karon-field">
              <label htmlFor="landry-skills">
                Skills: one category per line as <code>Category: skill1, skill2</code>, or a single line of items separated by commas or ·
              </label>
              <textarea
                id="landry-skills"
                value={data.skills}
                onChange={(e) => updateField('skills', e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title">References</h3>
            <div className="karon-field">
              <label htmlFor="landry-references">References (optional)</label>
              <textarea
                id="landry-references"
                value={data.references}
                onChange={(e) => updateField('references', e.target.value)}
                rows={5}
                placeholder={'Name, title — org\nemail · phone'}
              />
            </div>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title">Projects (optional)</h3>
            <p className="karon-pdf-raw__hint" style={{ marginTop: 0 }}>
              Appears at the bottom of the main column in PDF if filled.
            </p>
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
                  <label>Tech (optional)</label>
                  <input
                    value={row.tech}
                    onChange={(e) => updateProject(row.id, 'tech', e.target.value)}
                  />
                </div>
                <div className="karon-field">
                  <label>Dates</label>
                  <input
                    value={row.period}
                    onChange={(e) => updateProject(row.id, 'period', e.target.value)}
                  />
                </div>
                <div className="karon-field">
                  <label>Details</label>
                  <textarea
                    value={row.details}
                    onChange={(e) => updateProject(row.id, 'details', e.target.value)}
                    rows={3}
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
        </aside>

                <div className="karon-preview-wrap">
          <article className="landry-page" ref={previewRef}>
            <header className="landry-page__header">
              <h1 className="landry-page__name">{(data.fullName || 'Your name').toUpperCase()}</h1>
              {data.headline?.trim() ? <p className="landry-page__headline">{data.headline}</p> : null}
              {(data.email?.trim() ||
                data.linkedIn?.trim() ||
                contactLocationDisplay ||
                contactPhoneDisplay ||
                data.github?.trim()) ? (
                <div className="landry-contact-bar">
                  {data.email?.trim() ? (
                    <a className="landry-contact-bar__item" href={'mailto:' + data.email.trim()}>
                      {data.email.trim()}
                    </a>
                  ) : null}
                  {data.linkedIn?.trim() ? (
                    <a
                      className="landry-contact-bar__item"
                      href={pdfAbsLinkUrl(data.linkedIn)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LinkedIn
                    </a>
                  ) : null}
                  {contactLocationDisplay ? (
                    <span className="landry-contact-bar__item">{contactLocationDisplay}</span>
                  ) : null}
                  {contactPhoneDisplay ? (
                    <span className="landry-contact-bar__item">{contactPhoneDisplay}</span>
                  ) : null}
                  {data.github?.trim() ? (
                    <a
                      className="landry-contact-bar__item"
                      href={pdfAbsLinkUrl(data.github)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      GitHub
                    </a>
                  ) : null}
                </div>
              ) : null}
            </header>

            {data.summary?.trim() ? (
              <section className="landry-sec">
                <h2 className="landry-sec-title">Summary</h2>
                <p className="landry-summary-text">{data.summary}</p>
              </section>
            ) : null}

            {data.education.some((e) => e.school || e.degree || e.details) ? (
              <section className="landry-sec">
                <h2 className="landry-sec-title">Education</h2>
                <div className="landry-timeline">
                  {data.education.map((row) =>
                    row.school || row.degree || row.details ? (
                      <LandryTimelineRow key={row.id} dates={row.period} location={row.location}>
                        {row.degree?.trim() ? <div className="landry-tl-role">{row.degree}</div> : null}
                        {row.school?.trim() ? <div className="landry-tl-org">{row.school}</div> : null}
                        {row.details?.trim() ? (
                          <ul className="landry-tl-bullets">
                            {bulletsFromDetails(row.details).map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </ul>
                        ) : null}
                      </LandryTimelineRow>
                    ) : null,
                  )}
                </div>
              </section>
            ) : null}

            {data.experience.some((e) => e.title || e.company || e.details) ? (
              <section className="landry-sec">
                <h2 className="landry-sec-title">Experience</h2>
                <div className="landry-timeline">
                  {data.experience.map((row) =>
                    row.title || row.company || row.details ? (
                      <LandryTimelineRow key={row.id} dates={row.period} location={row.location}>
                        {row.title?.trim() ? (
                          <div className="landry-tl-role landry-tl-role--caps">
                            {(row.title || 'Role').toUpperCase()}
                          </div>
                        ) : null}
                        {row.company?.trim() ? <div className="landry-tl-org">{row.company}</div> : null}
                        {row.details?.trim() ? <LandryDetailBody details={row.details} /> : null}
                      </LandryTimelineRow>
                    ) : null,
                  )}
                </div>
              </section>
            ) : null}

            {(data.volunteerExperience || []).some((v) => v.title || v.organization || v.details) ? (
              <section className="landry-sec">
                <h2 className="landry-sec-title">Volunteer experience</h2>
                <div className="landry-timeline">
                  {(data.volunteerExperience || []).map((row) =>
                    row.title || row.organization || row.details ? (
                      <LandryTimelineRow key={row.id} dates={row.period} location={row.location}>
                        {row.title?.trim() ? <div className="landry-tl-role">{row.title}</div> : null}
                        {row.organization?.trim() ? (
                          <div className="landry-tl-org">{row.organization}</div>
                        ) : null}
                        {row.details?.trim() ? (
                          <ul className="landry-tl-bullets">
                            {bulletsFromDetails(row.details).map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </ul>
                        ) : null}
                      </LandryTimelineRow>
                    ) : null,
                  )}
                </div>
              </section>
            ) : null}

            {data.skills?.trim() ? (
              <section className="landry-sec landry-sec--skills">
                <h2 className="landry-sec-title">Skills</h2>
                <hr className="landry-sec-rule" />
                <div className="landry-skills-table">
                  {parseLandrySkillRows(data.skills).map((row, i) => (
                    <div
                      key={i}
                      className={
                        row.category?.trim()
                          ? 'landry-skills-row'
                          : 'landry-skills-row landry-skills-row--plain'
                      }
                    >
                      <div className="landry-skills-cat">{row.category}</div>
                      <div className="landry-skills-divider" aria-hidden="true" />
                      <div className="landry-skills-values">{row.skillsText}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {data.references?.trim() ? (
              <section className="landry-sec">
                <h2 className="landry-sec-title">References</h2>
                <p className="landry-refs-block">{data.references}</p>
              </section>
            ) : null}

            {data.projects.some((p) => p.name || p.tech || p.details) ? (
              <section className="landry-sec">
                <h2 className="landry-sec-title">Projects</h2>
                <div className="landry-timeline">
                  {data.projects.map((row) =>
                    row.name || row.tech || row.details ? (
                      <LandryTimelineRow key={row.id} dates={row.period} location={row.location}>
                        <div className="landry-tl-role">
                          {[row.name, row.tech].filter(Boolean).join(' — ') || 'Project'}
                        </div>
                        {row.details?.trim() ? <LandryDetailBody details={row.details} /> : null}
                      </LandryTimelineRow>
                    ) : null,
                  )}
                </div>
              </section>
            ) : null}
          </article>
        </div>
      </div>
    </div>
  );
}
