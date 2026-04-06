import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api';
import { Spinner } from '../components/shared';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await authApi.forgotPassword(email);
      setMessage(data.message);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Could not start password reset.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-pattern" />
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-mark">Lyfshilp</div>
          <div className="logo-sub">AI Document Tool</div>
        </div>

        <h1 className="login-title">Forgot password</h1>
        <p className="login-desc">Enter your work email and we&apos;ll send a reset link if the account exists.</p>

        {message && <div className="success-msg">{message}</div>}
        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Work Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@agilityai.in"
              required
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px', marginTop: 8 }}
            disabled={loading}
          >
            {loading ? <Spinner /> : 'Send reset link'}
          </button>
        </form>

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13 }}>
          <Link to="/login" style={{ color: 'var(--green-700)', textDecoration: 'none', fontWeight: 600 }}>
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
