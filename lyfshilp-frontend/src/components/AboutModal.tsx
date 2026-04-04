import { Modal } from './shared';

interface Props {
  onClose: () => void;
}

export default function AboutModal({ onClose }: Props) {
  const tagStyle = {
    background: 'var(--green-50)',
    color: 'var(--green-900)',
    border: '1px solid var(--green-100)',
    padding: '4px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
  };

  return (
    <Modal
      title="About Lyfshilp"
      subtitle="AI Doc Tool Platform"
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div className="detail-section-title" style={{ marginBottom: 10 }}>Version Details</div>
          <div style={{ fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--ink-soft)' }}>Application Version</span>
              <span style={{ fontWeight: 600 }}>v1.0.4</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--ink-soft)' }}>API Engine</span>
              <span style={{ fontWeight: 600 }}>v1.2.0</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ink-soft)' }}>Environment</span>
              <span style={{ fontWeight: 600 }}>Production</span>
            </div>
          </div>
        </div>

        <div>
          <div className="detail-section-title" style={{ marginBottom: 10 }}>Tech Stack</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={tagStyle}>React 18</span>
            <span style={tagStyle}>TypeScript</span>
            <span style={tagStyle}>Vite</span>
            <span style={tagStyle}>FastAPI</span>
            <span style={tagStyle}>Python</span>
            <span style={tagStyle}>Custom CSS Design System</span>
          </div>
        </div>

        <div>
           <div className="detail-section-title" style={{ marginBottom: 10 }}>AI Integration</div>
           <div style={{ fontSize: 13, color: 'var(--ink-mid)', lineHeight: 1.6, background: '#f9f9fa', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
             The system utilizes specialized Multi-LLM pipelines for rigorous document review against dynamic Brand Voice and stakeholder configurations.
           </div>
        </div>
      </div>
    </Modal>
  );
}
