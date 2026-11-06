import React from 'react';

export default function Badge({
  children,
  variant = 'neutral', // 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'neutral'
  icon: Icon,
  className = '',
  style = {},
  ...props
}) {
  const variantClass = {
    emerald: 'badge-emerald',
    amber: 'badge-amber',
    rose: 'badge-rose',
    blue: 'badge-blue',
    purple: 'badge-purple',
    neutral: 'badge-neutral'
  }[variant] || 'badge-neutral';

  return (
    <span className={`badge ${variantClass} ${className}`} style={style} {...props}>
      {React.isValidElement(Icon) ? Icon : Icon ? <Icon size={11} /> : null}
      {children}
    </span>
  );
}
