import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import React from 'react';

// ── Toast ─────────────────────────────────────────────────────────────────────

interface Toast { id: number; type: 'success' | 'error' | 'info'; message: string; }
interface ToastCtx { toast: (type: Toast['type'], message: string) => void; }

const ToastContext = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let counter = 0;

  const toast = useCallback((type: Toast['type'], message: string) => {
    const id = ++counter;
    setToasts(t => [...t, { id, type, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ dark }: { dark?: boolean }) {
  return <span className={`spinner ${dark ? 'spinner-dark' : ''}`} />;
}

function getInitials(name?: string | null, email?: string | null) {
  const source = (name?.trim() || email?.trim() || '?');
  if (source === '?') return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function getAvatarTone(seed: string) {
  const tones = [
    { bg: '#D8F3DC', fg: '#1B4332' },
    { bg: '#E8F1FF', fg: '#1D4ED8' },
    { bg: '#FFF1D6', fg: '#9A6700' },
    { bg: '#FDECEF', fg: '#BE123C' },
    { bg: '#EDE9FE', fg: '#6D28D9' },
    { bg: '#E6FFFA', fg: '#0F766E' },
  ];
  const index = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % tones.length;
  return tones[index];
}

export function Avatar({
  name,
  email,
  size = 'md',
}: {
  name?: string | null;
  email?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const label = name || email || '?';
  const initials = getInitials(name, email);
  const tone = getAvatarTone(label);

  return (
    <div
      className={`avatar avatar-${size}`}
      aria-label={label}
      title={label}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {initials}
    </div>
  );
}

// ── Badge helpers ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: 'Draft', pending: 'Pending', under_review: 'Under Review',
    approved: 'Approved', rejected: 'Rejected'
  };
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {labels[status] ?? status}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>—</span>;
  const cls = score >= 75 ? 'score-high' : score >= 50 ? 'score-mid' : 'score-low';
  return <span className={`score-badge ${cls}`}>{score}</span>;
}

const DOC_LABELS: Record<string, string> = {
  proposal: 'Proposal', cold_email: 'Cold Email', reply_email: 'Reply Email',
  whatsapp: 'WhatsApp', linkedin: 'LinkedIn', ad_creative: 'Ad Creative',
  payment_followup: 'Payment Follow-up'
};

export function DocTypeChip({ type }: { type: string }) {
  const fallback = type
    .split(/[_-]/g)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ');
  return <span className="doc-type-chip">{DOC_LABELS[type] ?? fallback}</span>;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── TextPreview ───────────────────────────────────────────────────────────────
// Renders a clamped snippet for table cells. Uses @chenglou/pretext to detect
// overflow via pure arithmetic — zero DOM reads, zero forced layout reflow.
import { prepare, layout } from '@chenglou/pretext';

export function TextPreview({
  text,
  maxLines = 2,
  containerWidth = 300,
  fontSize = 12,
  lineHeightRatio = 1.6,
  style,
}: {
  text: string;
  maxLines?: number;
  containerWidth?: number;
  fontSize?: number;
  lineHeightRatio?: number;
  style?: React.CSSProperties;
}) {
  const lineHeightPx = fontSize * lineHeightRatio;
  const clampHeight  = maxLines * lineHeightPx;
  const prepared     = prepare(text || ' ', `${fontSize}px Inter, sans-serif`);
  const { lineCount } = layout(prepared, containerWidth, lineHeightPx);
  const isTruncated  = lineCount > maxLines;

  return (
    <div
      style={{
        fontSize,
        lineHeight: lineHeightRatio,
        color: 'var(--ink-soft)',
        maxHeight: `${clampHeight}px`,
        overflow: 'hidden',
        maskImage: isTruncated ? 'linear-gradient(to bottom, black 50%, transparent 100%)' : undefined,
        WebkitMaskImage: isTruncated ? 'linear-gradient(to bottom, black 50%, transparent 100%)' : undefined,
        ...style,
      }}
      title={text}
    >
      {text}
    </div>
  );
}

export function ApprovalBanner({ isFounder }: { isFounder?: boolean }) {
  return (
    <div className="approval-banner">
      <div>
        <div className="approval-banner-title">Account approval pending</div>
        <div className="approval-banner-text">
          {isFounder
            ? 'This account is inactive. Founders can review documents, but approval actions should be handled from an active account.'
            : 'You can sign in and view the workspace, but creating drafts, uploading files, and sending documents for approval stay locked until a founder approves your account.'}
        </div>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'default' | 'lg';
}

export function Modal({ title, subtitle, onClose, children, footer, size = 'default' }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-subtitle">{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
