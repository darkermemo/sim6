import React from 'react';

interface Option {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface Props {
  value: string | number;
  onChange: (value: string | number) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  size?: 'xs' | 'sm' | 'md';
  label?: string;
  'aria-label'?: string;
}

/**
 * CompactSelect - Modern select component that matches our design system
 * Designed for compact layouts with consistent styling
 */
export default function CompactSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  size = 'sm',
  label,
  'aria-label': ariaLabel,
}: Props) {
  const sizeStyles = {
    xs: {
      padding: '1px 4px',
      fontSize: '9px',
      borderRadius: '2px',
      minWidth: '50px',
    },
    sm: {
      padding: '2px 6px',
      fontSize: '10px',
      borderRadius: '3px',
      minWidth: '70px',
    },
    md: {
      padding: '4px 8px',
      fontSize: '11px',
      borderRadius: '4px',
      minWidth: '100px',
    },
  };

  const styles = sizeStyles[size];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {label && (
        <label style={{
          fontSize: size === 'xs' ? '8px' : size === 'sm' ? '9px' : '10px',
          color: '#64748b',
          fontWeight: 600,
        }}>
          {label}
        </label>
      )}
      
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={ariaLabel || label}
          style={{
            ...styles,
            border: '1px solid var(--border-default)',
            backgroundColor: disabled ? 'var(--bg-muted)' : 'var(--bg-surface)',
            color: disabled ? 'var(--fg-muted)' : 'var(--fg-default)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            outline: 'none',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23374151' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: `right ${size === 'xs' ? '2px' : size === 'sm' ? '3px' : '4px'} center`,
            backgroundSize: size === 'xs' ? '8px' : size === 'sm' ? '10px' : '12px',
            paddingRight: size === 'xs' ? '14px' : size === 'sm' ? '18px' : '22px',
            transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--color-primary)';
            e.target.style.boxShadow = 'var(--focus-ring)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--border-default)';
            e.target.style.boxShadow = 'none';
          }}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
