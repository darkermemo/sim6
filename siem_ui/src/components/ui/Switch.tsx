import React from 'react';
import { clsx } from 'clsx';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  className,
}: SwitchProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={clsx(
        'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        {
          'bg-blue-600': checked && !disabled,
          'bg-gray-200': !checked && !disabled,
          'bg-gray-100': disabled,
          'cursor-not-allowed': disabled,
          'h-5 w-9': size === 'sm',
          'h-6 w-11': size === 'md',
        },
        className
      )}
    >
      <span
        className={clsx(
          'pointer-events-none inline-block transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
          {
            'h-4 w-4': size === 'sm',
            'h-5 w-5': size === 'md',
            'translate-x-4': checked && size === 'sm',
            'translate-x-5': checked && size === 'md',
            'translate-x-0': !checked,
          }
        )}
      />
    </button>
  );
} 