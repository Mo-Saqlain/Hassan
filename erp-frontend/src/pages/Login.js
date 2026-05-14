import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Brand from '../components/Brand';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState('login'); // 'login' | 'request'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      const to = loc.state?.from || '/';
      nav(to, { replace: true });
    } catch (err) {
      setError(err.uiMessage ?? 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <Brand rail={false} onToggleRail={() => {}} />
        </div>

        {mode === 'login' ? (
          <>
            <h1>Sign in</h1>
            <p className="muted">
              Welcome to Hassan Electronics ERP. Use the credentials provided by your administrator.
            </p>

            <form onSubmit={submit} className="login-form">
              <label>Username</label>
              <input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              {error && <div className="alert alert-error">{error}</div>}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy}
                style={{ marginTop: 8 }}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="login-aside">
              Don't have an account?{' '}
              <button
                type="button"
                className="btn btn-link"
                onClick={() => {
                  setMode('request');
                  setError(null);
                }}
              >
                Request access
              </button>
            </div>
          </>
        ) : (
          <RequestAccess
            onDone={() => setMode('login')}
            onCancel={() => {
              setMode('login');
              setError(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function RequestAccess({ onDone, onCancel }) {
  const [form, setForm] = useState({
    requestedUsername: '',
    fullName: '',
    phone: '',
    email: '',
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        requestedUsername: form.requestedUsername.trim(),
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        reason: form.reason.trim() || undefined,
      };
      await api.post('/auth/request-access', payload);
      setSubmitted(true);
    } catch (err) {
      setError(err.uiMessage ?? 'Could not submit request');
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <>
        <h1>Request received</h1>
        <p className="muted">
          The administrator has been notified. You'll be able to sign in
          once your request is approved and a password is assigned to you.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onDone}
          style={{ marginTop: 12 }}
        >
          Back to sign in
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Request access</h1>
      <p className="muted">
        Tell the administrator who you are. They'll review your request
        and assign you a username + password.
      </p>

      <form onSubmit={submit} className="login-form">
        <label>Desired username *</label>
        <input
          autoFocus
          value={form.requestedUsername}
          onChange={set('requestedUsername')}
          required
          minLength={2}
        />
        <label>Full name *</label>
        <input
          value={form.fullName}
          onChange={set('fullName')}
          required
          minLength={2}
        />
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div>
            <label>Phone</label>
            <input value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label>Email</label>
            <input type="email" value={form.email} onChange={set('email')} />
          </div>
        </div>
        <label>Reason / role you'd take on</label>
        <textarea
          rows={3}
          value={form.reason}
          onChange={set('reason')}
          placeholder="e.g. Cashier on the POS terminal, Saturday shift"
        />
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit request'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
