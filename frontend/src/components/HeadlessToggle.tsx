import React from 'react';

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export const HeadlessToggle: React.FC<Props> = ({ enabled, onChange, disabled = false }) => {
  return (
    <div style={containerStyle}>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          style={checkboxStyle}
        />
        <span style={textStyle}>
          Modo Headless
        </span>
      </label>
      <div style={descriptionStyle}>
        {enabled 
          ? "🔒 Login executará em segundo plano (sem janela visível)" 
          : "👀 Login abrirá janela do navegador para interação"
        }
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};

const checkboxStyle: React.CSSProperties = {
  cursor: 'pointer',
};

const textStyle: React.CSSProperties = {
  userSelect: 'none',
};

const descriptionStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#666',
  marginLeft: 20,
  fontStyle: 'italic',
};

export default HeadlessToggle;