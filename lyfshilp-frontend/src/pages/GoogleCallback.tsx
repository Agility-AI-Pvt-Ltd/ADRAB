import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, usersApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from '../components/shared';

const HANDLED_CODE_KEY = 'google_oauth_handled_code';
const OAUTH_FLOW_KEY = 'google_oauth_flow';
const OAUTH_STATE_KEY = 'google_oauth_state';

export default function GoogleCallback() {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code) {
      navigate('/login');
      return;
    }

    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    if (expectedState && state && expectedState !== state) {
      sessionStorage.removeItem(HANDLED_CODE_KEY);
      sessionStorage.removeItem(OAUTH_FLOW_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      navigate('/login', { replace: true });
      return;
    }

    const handledCode = sessionStorage.getItem(HANDLED_CODE_KEY);
    if (handledCode === code) {
      return;
    }
    sessionStorage.setItem(HANDLED_CODE_KEY, code);

    const flow = sessionStorage.getItem(OAUTH_FLOW_KEY) ?? 'login';

    const cleanup = () => {
      sessionStorage.removeItem(HANDLED_CODE_KEY);
      sessionStorage.removeItem(OAUTH_FLOW_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
    };

    const onError = () => {
      cleanup();
      navigate(flow === 'drive-link' ? '/profile' : '/login', { replace: true });
    };

    if (flow === 'drive-link') {
      usersApi.googleDriveCallback(code)
        .then(() => {
          cleanup();
          navigate('/profile?drive=connected', { replace: true });
        })
        .catch(onError);
      return;
    }

    authApi.googleCallback(code)
      .then(async ({ data }) => {
        cleanup();
        await completeLogin(data.access_token, data.refresh_token);
        navigate('/dashboard', { replace: true });
      })
      .catch(onError);
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
