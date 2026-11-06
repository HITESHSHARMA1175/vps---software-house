import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'danger'
  size = 'md',        // 'sm' | 'md' | 'lg'
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  className = '',
  style = {},
  onClick,
  type = 'button',
  title,
  ...props
}) {
  const variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    outline: 'btn-secondary'
  }[variant] || 'btn-primary';

  const sizeClass = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg'
  }[size] || '';

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      style={style}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      {...props}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 12 : 14} style={{ animation: 'spin 1s linear infinite' }} />
      ) : React.isValidElement(Icon) && iconPosition === 'left' ? (
        Icon
      ) : Icon && iconPosition === 'left' ? (
        <Icon size={size === 'sm' ? 13 : 15} />
      ) : null}
      
      {children}

      {!loading && (
        React.isValidElement(Icon) && iconPosition === 'right' ? (
          Icon
        ) : Icon && iconPosition === 'right' ? (
          <Icon size={size === 'sm' ? 13 : 15} />
        ) : null
      )}
    </button>
  );
}
