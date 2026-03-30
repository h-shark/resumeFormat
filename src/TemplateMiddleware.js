import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './KaronMiddleware.css';

const ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * @param {{ badge: string; basePath: string }} props
 * basePath without trailing slash, e.g. "/karon" → editor at "/karon/editor"
 */
function TemplateMiddleware({ badge, basePath }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const root = basePath.replace(/\/$/, '') || basePath;
  const editorPath = `${root}/editor`;

  const pickFiles = useCallback(
    (files) => {
      const next = files && files[0];
      if (next) {
        setFile(next);
        navigate(editorPath, {
          state: { uploadedFile: next, uploadedFileName: next.name },
        });
      }
    },
    [navigate, editorPath],
  );

  const onInputChange = useCallback(
    (e) => {
      pickFiles(e.target.files);
      e.target.value = '';
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

  return (
    <div className="karon-mw">
      <div className="karon-mw__top">
        <Link to="/templates">← Back</Link>
        <span />
      </div>

      <span className="karon-mw__badge">{badge}</span>
      <h1>Use this resume template</h1>
      <p className="karon-mw__sub">
        Upload your current resume and we&apos;ll open the editor next — same idea as{' '}
        <a
          href="https://app.enhancv.com/resume-templates-landing?template=predefined-5qrYXQbt8MXosSangeHubuHcrtXngD9HS5MSLmNn"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0d9488', fontWeight: 600 }}
        >
          Enhancv&apos;s template landing
        </a>
        .
      </p>

      <div className="karon-mw__card">
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
        >
          <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={onInputChange} />
          <svg className="karon-mw__drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
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
          {file ? <p className="karon-mw__file-name">Selected: {file.name}</p> : null}
        </div>

      </div>
    </div>
  );
}

export default TemplateMiddleware;
