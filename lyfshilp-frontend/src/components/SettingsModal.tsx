import { Modal } from './shared';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Modal title="Settings" onClose={onClose} size="default">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Appearance</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Toggle between light and dark themes.</div>
          </div>
          <button
            className={`theme-toggle ${theme === 'dark' ? 'dark' : ''}`}
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label="Toggle theme"
          >
            <div className="theme-toggle-thumb">{theme === 'dark' ? '🌙' : '☀️'}</div>
          </button>
        </div>
      </div>
    </Modal>
  );
}
