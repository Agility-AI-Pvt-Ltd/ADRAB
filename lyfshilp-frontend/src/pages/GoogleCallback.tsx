import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from '../components/shared';

const HANDLED_CODE_KEY = 'google_oauth_handled_code';

export default function GoogleCallback() {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      navigate('/login');
      return;
    }

    const handledCode = sessionStorage.getItem(HANDLED_CODE_KEY);
    if (handledCode === code) {
      return;
    }
    sessionStorage.setItem(HANDLED_CODE_KEY, code);

    authApi.googleCallback(code)
      .then(async ({ data }) => {
        sessionStorage.removeItem(HANDLED_CODE_KEY);
        await completeLogin(data.access_token, data.refresh_token);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        sessionStorage.removeItem(HANDLED_CODE_KEY);
        navigate('/login', { replace: true });
      });
  }, [completeLogin, navigate]);

  return (
    <div className="loading-page">
      <div style={{ textAlign: 'center' }}>
        <Spinner dark />
        <div style={{ marginTop: 14, fontSize: 14, color: 'var(--ink-soft)' }}>Signing you in…</div>
      </div>
    </div>
  );
}
