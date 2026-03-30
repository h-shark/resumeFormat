import { useState, useCallback, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import './App.css';
import KaronMiddleware from './KaronMiddleware';
import KaronTemplate from './KaronTemplate';
import LandryMiddleware from './LandryMiddleware';
import LandryTemplate from './LandryTemplate';
import ChazMiddleware from './ChazMiddleware';
import ChazTemplate from './ChazTemplate';

const AUTH_STORAGE_KEY =
  (process.env.REACT_APP_RESUME_AUTH_STORAGE_KEY || 're_resume_unlocked').trim() || 're_resume_unlocked';
// Frontend-only note:
// This app runs in the browser, so any "secret" placed in JS is effectively public (bundled to the client).
const SIGNUP_PASSWORD = 'Dash7712345&&';

const AuthRefreshContext = createContext(() => {});

function isResumeAppUnlocked() {
  return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(AUTH_STORAGE_KEY) === '1';
}

function setResumeAppUnlocked() {
  sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
}

function SignUp({ afterUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === SIGNUP_PASSWORD) {
      setError('');
      setResumeAppUnlocked();
      afterUnlock();
    } else {
      setError('Incorrect password.');
    }
  };

  return (
    <div className="App">
      <main className="App-signup">
        <h1 className="App-signup__title">Sign up</h1>
        <form className="App-signup__form" onSubmit={handleSubmit} noValidate>
          <label className="App-signup__label" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            name="password"
            type="password"
            className="App-signup__input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            autoComplete="new-password"
            autoFocus
          />
          {error ? (
            <p className="App-signup__error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="App-signup__submit">
            Continue
          </button>
        </form>
      </main>
    </div>
  );
}

/** Shows children only when unlocked; otherwise same sign-up UI without changing the URL. */
function ProtectedRoute({ children }) {
  const refreshAuth = useContext(AuthRefreshContext);
  if (!isResumeAppUnlocked()) {
    return <SignUp afterUnlock={() => refreshAuth()} />;
  }
  return children;
}

function SignUpAtRoot() {
  const navigate = useNavigate();
  const refreshAuth = useContext(AuthRefreshContext);
  return (
    <SignUp
      afterUnlock={() => {
        refreshAuth();
        navigate('/templates', { replace: true });
      }}
    />
  );
}

const publicAsset = (file) => {
  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  return `${base}/${file}`.replace(/\/+/g, '/');
};

function Home() {
  return (
    <div className="App">
      <header className="App-header">
        <h1 className="App-home-title">Resume Template</h1>
        <nav className="App-home-templates" aria-label="Choose resume template">
          <Link to="/karon" className="App-home-template-link">
            <img src={publicAsset('karon_bg.png')} alt="" className="App-home-template-img" />
            <span className="App-home-template-label">Karon</span>
          </Link>
          <Link to="/landry" className="App-home-template-link">
            <img src={publicAsset('landry_bg.png')} alt="" className="App-home-template-img" />
            <span className="App-home-template-label">Landry</span>
          </Link>
          <Link to="/chaz" className="App-home-template-link">
            <img src={publicAsset('chaz_bg.png')} alt="" className="App-home-template-img" />
            <span className="App-home-template-label">Chaz</span>
          </Link>
        </nav>
      </header>
    </div>
  );
}

function CatchAllRoute() {
  const navigate = useNavigate();
  const refreshAuth = useContext(AuthRefreshContext);
  if (isResumeAppUnlocked()) {
    return <Navigate to="/templates" replace />;
  }
  return (
    <SignUp
      afterUnlock={() => {
        refreshAuth();
        navigate('/templates', { replace: true });
      }}
    />
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SignUpAtRoot />} />
      <Route
        path="/templates"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/karon"
        element={
          <ProtectedRoute>
            <KaronMiddleware />
          </ProtectedRoute>
        }
      />
      <Route
        path="/karon/editor"
        element={
          <ProtectedRoute>
            <KaronTemplate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/landry"
        element={
          <ProtectedRoute>
            <LandryMiddleware />
          </ProtectedRoute>
        }
      />
      <Route
        path="/landry/editor"
        element={
          <ProtectedRoute>
            <LandryTemplate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chaz"
        element={
          <ProtectedRoute>
            <ChazMiddleware />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chaz/editor"
        element={
          <ProtectedRoute>
            <ChazTemplate />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<CatchAllRoute />} />
    </Routes>
  );
}

function App() {
  const [, setAuthTick] = useState(0);
  const refreshAuth = useCallback(() => setAuthTick((t) => t + 1), []);

  return (
    <AuthRefreshContext.Provider value={refreshAuth}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthRefreshContext.Provider>
  );
}

export default App;
