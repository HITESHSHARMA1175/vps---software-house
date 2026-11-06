import React from 'react';

export default function Input({
  label,
  error,
  icon: Icon,
  className = '',
  style = {},
  id,
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="form-group" style={style}>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {Icon && (
          <Icon
            size={14}
            style={{
              position: 'absolute',
              left: '11px',
              color: 'var(--text-muted)',
              pointerEvents: 'none'
            }}
          />
        )}
        <input
          id={inputId}
          className={`input ${className}`}
          style={{
            paddingLeft: Icon ? '32px' : '12px'
          }}
          {...props}
        />
      </div>
      {error && (
        <span style={{ fontSize: '11px', color: 'var(--accent-rose)', marginTop: '2px' }}>
          {error}
        </span>
      )}
    </div>
  );
}
