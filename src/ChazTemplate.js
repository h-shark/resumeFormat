import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { extractTextAndAnnotationLinksFromPdf, parseResumeFromPdfText } from './resumePdfParse';
import { pdfAbsLinkUrl } from './landryPdf';
import { buildChazResumePdf, pdfTelHref } from './chazPdf';
import './KaronTemplate.css';
import './ChazTemplate.css';

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

const chazEmpty = {
  fullName: '',
  headline: '',
  email: '',
  phone: '',
  linkedIn: '',
  location: '',
  summary: '',
  experience: [],
  education: [],
  achievements: [],
  skills: '',
};

const defaultChaz = {
  fullName: 'Oliver Davis',
  headline: 'Human Resources Specialist | Recruitment | Employee Relations | Performance Management',
  email: 'oliver.davis@email.com',
  phone: '+1 312 555 0123',
  linkedIn: 'https://linkedin.com/in/oliverdavis',
  location: 'Chicago, Illinois',
  summary:
    'Results-driven HR professional with experience across recruitment, onboarding, and employee relations. Strong track record improving process clarity, stakeholder communication, and policy alignment while supporting managers through coaching and performance conversations.',
  experience: [
    {
      id: newId(),
      title: 'Human Resources Coordinator',
      company: 'Northwind Talent Partners',
      period: '01/2023 - 12/2024',
      location: 'Chicago, IL',
      highlighted: false,
      details:
        '• Supported full-cycle recruiting for professional roles; coordinated interviews and candidate communications.\n• Maintained HR records and assisted with benefits enrollment and leave administration.\n• Partnered with managers on employee relations matters and policy interpretation.',
    },
    {
      id: newId(),
      title: 'HR Assistant',
      company: 'Lakeside Healthcare Group',
      period: '06/2021 - 12/2022',
      location: 'Chicago, IL',
      highlighted: false,
      details:
        '• Scheduled interviews, drafted offer letters, and tracked pre-employment requirements.\n• Updated the HRIS and produced reports for compliance and headcount planning.\n• Helped roll out an employee handbook refresh with FAQs for supervisors.',
    },
    {
      id: newId(),
      title: 'Recruitment Intern',
      company: 'Metro Staffing Co.',
      period: '01/2020 - 05/2021',
      location: 'Chicago, IL',
      highlighted: true,
      details:
        '• Sourced candidates via job boards and campus outreach; screened resumes for early-career roles.\n• Logged candidate status in ATS and supported onboarding checklists for new hires.',
    },
  ],
  education: [
    {
      id: newId(),
      degree: "Bachelor's Degree in Human Resources Management",
      school: 'DePaul University',
      period: '01/2015 - 01/2019',
      location: 'Chicago, IL',
    },
  ],
  achievements: [
    {
      id: newId(),
      title: 'Implemented Employee Feedback Program',
      description:
        'Designed a lightweight quarterly pulse survey and summary templates for leadership, improving visibility into engagement themes and follow-up actions across two business units.',
    },
    {
      id: newId(),
      title: 'Reduced Time-to-Offer for Key Roles',
      description:
        'Streamlined scheduling and intake forms for hiring managers, contributing to a measurable reduction in time-to-offer for priority requisitions while preserving candidate experience.',
    },
    {
      id: newId(),
      title: 'Onboarding Playbook',
      description:
        'Created a concise onboarding checklist and first-week agenda used by managers to set expectations and reduce early turnover among new employees.',
    },
  ],
  skills: `Recruitment & full-cycle hiring
Interview coordination & offer support
Employee relations & policy guidance
HRIS / ATS (Workday, reporting)
Performance management & manager coaching`,
};

function countPdfFields(parsed) {
  let n = 0;
  if (parsed.fullName) n += 1;
  if (parsed.email) n += 1;
  if (parsed.phone) n += 1;
  if (parsed.linkedIn) n += 1;
  if (parsed.location) n += 1;
  if (parsed.summary) n += 1;
  if (parsed.skills) n += 1;
  n += parsed.experience?.length || 0;
  n += parsed.education?.length || 0;
  return n;
}

function bulletsFromDetails(details) {
  return String(details || '')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

/** One list item per non-empty line (right-column Skills block). */
function chazSkillsFromText(skills) {
  return String(skills || '')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

export default function ChazTemplate({ brandName = 'Chaz', middlewarePath = '/chaz' } = {}) {
  const location = useLocation();
  const uploadedFile = location.state?.uploadedFile;
  const uploadedFileName = location.state?.uploadedFileName;
  const isPdfUpload =
    uploadedFile instanceof File &&
    (uploadedFile.type === 'application/pdf' || uploadedFile.name?.toLowerCase().endsWith('.pdf'));

  const [data, setData] = useState(() => (isPdfUpload ? { ...chazEmpty } : defaultChaz));
  const [pdfRawText, setPdfRawText] = useState(() => (isPdfUpload ? undefined : null));
  const [importStatus, setImportStatus] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
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
        if (cancelled) return;
        setData({
          ...chazEmpty,
          fullName: parsed.fullName || '',
          headline: '',
          email: parsed.email || '',
          phone: parsed.phone || '',
          linkedIn,
          location: parsed.location || '',
          summary: parsed.summary || '',
          skills: parsed.skills || '',
          experience: (parsed.experience || []).map((row) => ({
            id: newId(),
            title: row.title || '',
            company: row.company || '',
            period: row.period || '',
            location: row.location || '',
            highlighted: false,
            details: row.details || '',
          })),
          education: (parsed.education || []).map((row) => ({
            id: newId(),
            school: row.school || '',
            degree: row.degree || '',
            period: row.period || '',
            location: row.location || '',
          })),
          achievements: [],
        });
        const filled = countPdfFields({ ...parsed, linkedIn });
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
        { id: newId(), company: '', title: '', period: '', location: '', highlighted: false, details: '' },
      ],
    }));
  }, []);

  const removeExperience = useCallback((id) => {
    setData((d) => ({ ...d, experience: d.experience.filter((row) => row.id !== id) }));
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
        { id: newId(), school: '', degree: '', period: '', location: '' },
      ],
    }));
  }, []);

  const removeEducation = useCallback((id) => {
    setData((d) => ({ ...d, education: d.education.filter((row) => row.id !== id) }));
  }, []);

  const updateAch = useCallback((id, key, value) => {
    setData((d) => ({
      ...d,
      achievements: d.achievements.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    }));
  }, []);

  const addAchievement = useCallback(() => {
    setData((d) => ({
      ...d,
      achievements: [...d.achievements, { id: newId(), title: '', description: '' }],
    }));
  }, []);

  const removeAchievement = useCallback((id) => {
    setData((d) => ({ ...d, achievements: d.achievements.filter((row) => row.id !== id) }));
  }, []);

  const downloadPdf = useCallback(async () => {
    if (pdfLockRef.current) return;
    pdfLockRef.current = true;
    setPdfBusy(true);
    try {
      await buildChazResumePdf(data);
    } catch (e) {
      console.error(e);
      window.alert('Could not create PDF. Try again or use Print to PDF from your browser.');
    } finally {
      pdfLockRef.current = false;
      setPdfBusy(false);
    }
  }, [data]);

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
            Chaz matches the two-column Enhancv look: green section labels, main column + Key achievements.{' '}
            <a
              href="https://app.enhancv.com/resume/new?example=predefined-g3RnTLVSXswzXXBW4soUhwi4Q8aE5id6daK5OL8q"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--chaz-green, #22a86c)' }}
            >
              Template reference
            </a>
          </p>

          {pdfRawText !== null ? (
            <div className="karon-section karon-pdf-raw">
              <h3 className="karon-section__title">Text from your PDF</h3>
              {pdfRawText === undefined ? (
                <p className="karon-pdf-raw__loading">Reading…</p>
              ) : (
                <textarea
                  className="karon-pdf-raw__textarea"
                  readOnly
                  value={pdfRawText}
                  rows={10}
                  spellCheck={false}
                  aria-label="Extracted PDF text"
                />
              )}
            </div>
          ) : null}

          <div className="karon-section">
            <h3 className="karon-section__title">Profile</h3>
            <div className="karon-field">
              <label htmlFor="chaz-fullName">Full name</label>
              <input
                id="chaz-fullName"
                value={data.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="karon-field">
              <label htmlFor="chaz-headline">Headline (use | between phrases)</label>
              <input
                id="chaz-headline"
                value={data.headline}
                onChange={(e) => updateField('headline', e.target.value)}
                placeholder="Role | Skill | Skill"
              />
            </div>
            <div className="karon-field">
              <label htmlFor="chaz-email">Email</label>
              <input
                id="chaz-email"
                type="email"
                value={data.email}
                onChange={(e) => updateField('email', e.target.value)}
              />
            </div>
            <div className="karon-field">
              <label htmlFor="chaz-phone">Phone</label>
              <input
                id="chaz-phone"
                type="tel"
                value={data.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                autoComplete="tel"
                placeholder="e.g. +1 312 555 0123"
              />
            </div>
            <div className="karon-field">
              <label htmlFor="chaz-linkedIn">LinkedIn</label>
              <input
                id="chaz-linkedIn"
                type="url"
                value={data.linkedIn}
                onChange={(e) => updateField('linkedIn', e.target.value)}
                placeholder="https://…"
                autoComplete="url"
              />
            </div>
            <div className="karon-field">
              <label htmlFor="chaz-location">Location</label>
              <input
                id="chaz-location"
                value={data.location}
                onChange={(e) => updateField('location', e.target.value)}
              />
            </div>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title">Summary</h3>
            <div className="karon-field">
              <textarea
                id="chaz-summary"
                value={data.summary}
                onChange={(e) => updateField('summary', e.target.value)}
                rows={5}
              />
            </div>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title">Experience</h3>
            {data.experience.map((row) => (
              <div key={row.id} className="karon-subcard">
                <div className="karon-field">
                  <label>Job title</label>
                  <input value={row.title} onChange={(e) => updateExp(row.id, 'title', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Company</label>
                  <input value={row.company} onChange={(e) => updateExp(row.id, 'company', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Dates</label>
                  <input value={row.period} onChange={(e) => updateExp(row.id, 'period', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Location</label>
                  <input value={row.location || ''} onChange={(e) => updateExp(row.id, 'location', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!row.highlighted}
                      onChange={(e) => updateExp(row.id, 'highlighted', e.target.checked)}
                    />{' '}
                    Highlight (green border — e.g. internship)
                  </label>
                </div>
                <div className="karon-field">
                  <label>Bullets (one per line)</label>
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
            <h3 className="karon-section__title">Education</h3>
            <p className="karon-pdf-raw__hint" style={{ marginTop: 0 }}>
              Shown in the preview right column, below Skills and above Key achievements.
            </p>
            {data.education.map((row) => (
              <div key={row.id} className="karon-subcard">
                <div className="karon-field">
                  <label>Degree</label>
                  <input value={row.degree} onChange={(e) => updateEdu(row.id, 'degree', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>School</label>
                  <input value={row.school} onChange={(e) => updateEdu(row.id, 'school', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Dates</label>
                  <input value={row.period} onChange={(e) => updateEdu(row.id, 'period', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Location</label>
                  <input value={row.location || ''} onChange={(e) => updateEdu(row.id, 'location', e.target.value)} />
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
            <h3 className="karon-section__title">Skills (right column)</h3>
            <p className="karon-pdf-raw__hint" style={{ marginTop: 0 }}>
              One skill or phrase per line; shown at the top of the preview sidebar, above Key achievements.
            </p>
            <div className="karon-field">
              <label htmlFor="chaz-skills">Skills</label>
              <textarea
                id="chaz-skills"
                value={data.skills}
                onChange={(e) => updateField('skills', e.target.value)}
                rows={6}
                placeholder={'One per line, e.g.\nInterview coordination\nWorkday / HRIS'}
              />
            </div>
          </div>

          <div className="karon-section">
            <h3 className="karon-section__title">Key achievements</h3>
            <p className="karon-pdf-raw__hint" style={{ marginTop: 0 }}>
              Shown in the right column below Skills.
            </p>
            {data.achievements.map((row) => (
              <div key={row.id} className="karon-subcard">
                <div className="karon-field">
                  <label>Title</label>
                  <input value={row.title} onChange={(e) => updateAch(row.id, 'title', e.target.value)} />
                </div>
                <div className="karon-field">
                  <label>Description</label>
                  <textarea
                    value={row.description}
                    onChange={(e) => updateAch(row.id, 'description', e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="karon-row-actions">
                  <button
                    type="button"
                    className="karon-btn karon-btn--small karon-btn--danger"
                    onClick={() => removeAchievement(row.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="karon-btn karon-btn--ghost" onClick={addAchievement}>
              + Add achievement
            </button>
          </div>
        </aside>

        <div className="karon-preview-wrap" ref={previewRef}>
          <article className="chaz-page">
            <header className="chaz-page__header">
              <h1 className="chaz-page__name">{(data.fullName || 'Your name').toUpperCase()}</h1>
              {data.headline?.trim() ? <p className="chaz-page__tagline">{data.headline.trim()}</p> : null}
              {(data.email?.trim() ||
                data.phone?.trim() ||
                data.linkedIn?.trim() ||
                data.location?.trim()) ? (
                <div className="chaz-contact">
                  {data.email?.trim() ? (
                    <a className="chaz-contact__item" href={`mailto:${data.email.trim()}`}>
                      Email
                    </a>
                  ) : null}
                  {data.phone?.trim() ? (
                    <a className="chaz-contact__item" href={pdfTelHref(data.phone)}>
                      {data.phone.trim()}
                    </a>
                  ) : null}
                  {data.linkedIn?.trim() ? (
                    <a
                      className="chaz-contact__item"
                      href={pdfAbsLinkUrl(data.linkedIn)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LinkedIn
                    </a>
                  ) : null}
                  {data.location?.trim() ? (
                    <span className="chaz-contact__item">{data.location.trim()}</span>
                  ) : null}
                </div>
              ) : null}
            </header>

            <div className="chaz-page__grid">
              <div className="chaz-main">
                {data.summary?.trim() ? (
                  <section className="chaz-sec">
                    <h2 className="chaz-sec-title">Summary</h2>
                    <p className="chaz-summary-text">{data.summary}</p>
                  </section>
                ) : null}

                {data.experience.some((e) => e.title || e.company || e.details) ? (
                  <section className="chaz-sec">
                    <h2 className="chaz-sec-title">Experience</h2>
                    {data.experience.map((row) =>
                      row.title || row.company || row.details ? (
                        <div
                          key={row.id}
                          className={`chaz-exp${row.highlighted ? ' chaz-exp--highlight' : ''}`}
                        >
                          {row.title?.trim() ? <div className="chaz-exp__title">{row.title.trim()}</div> : null}
                          <div className="chaz-exp__meta">
                            {[row.company, row.period, row.location].filter(Boolean).join(' · ')}
                          </div>
                          {row.details?.trim() ? (
                            <ul className="chaz-exp__bullets">
                              {bulletsFromDetails(row.details).map((b, index) => (
                                <li key={`${row.id}-bullet-${index}`}>{b}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null,
                    )}
                  </section>
                ) : null}
              </div>

              <aside className="chaz-aside">
                {data.skills?.trim() ? (
                  <section className="chaz-sec">
                    <h2 className="chaz-sec-title">Skills</h2>
                    <ul className="chaz-skills">
                      {chazSkillsFromText(data.skills).map((item, i) => (
                        <li key={`${i}-${item.slice(0, 48)}`}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {data.education.some((e) => e.school || e.degree) ? (
                  <section className="chaz-sec">
                    <h2 className="chaz-sec-title">Education</h2>
                    {data.education.map((row) =>
                      row.school || row.degree ? (
                        <div key={row.id} className="chaz-edu">
                          {row.degree?.trim() ? <div className="chaz-edu__degree">{row.degree.trim()}</div> : null}
                          {row.school?.trim() ? <div className="chaz-edu__school">{row.school.trim()}</div> : null}
                          {(row.period?.trim() || row.location?.trim()) ? (
                            <div className="chaz-edu__meta">
                              {[row.period, row.location].filter(Boolean).join(' · ')}
                            </div>
                          ) : null}
                        </div>
                      ) : null,
                    )}
                  </section>
                ) : null}
                {data.achievements.some((a) => a.title || a.description) ? (
                  <section className="chaz-sec">
                    <h2 className="chaz-sec-title">Key achievements</h2>
                    {data.achievements.map((row) =>
                      row.title || row.description ? (
                        <div key={row.id} className="chaz-ach">
                          {row.title?.trim() ? (
                            <div className="chaz-ach__title">{row.title.trim()}</div>
                          ) : null}
                          {row.description?.trim() ? (
                            <p className="chaz-ach__desc">{row.description.trim()}</p>
                          ) : null}
                        </div>
                      ) : null,
                    )}
                  </section>
                ) : null}
              </aside>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
