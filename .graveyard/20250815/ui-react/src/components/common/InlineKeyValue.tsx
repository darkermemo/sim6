import React from 'react';
import { cn } from '@/lib/utils';
import { CopyButton } from './CopyButton';

interface InlineKeyValueProps {
  label: string;
  value: React.ReactNode;
  copyable?: boolean;
  className?: string;
  valueClassName?: string;
}

export function InlineKeyValue({ 
  label, 
  value, 
  copyable = false, 
  className,
  valueClassName 
}: InlineKeyValueProps) {
  const stringValue = typeof value === 'string' || typeof value === 'number' 
    ? String(value) 
    : JSON.stringify(value);

  return (
    <div className={cn("flex items-start gap-2", className)}>
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 min-w-[120px]">
        {label}:
      </span>
      <div className="flex items-center gap-2 flex-1">
        <span className={cn(
          "text-sm text-gray-900 dark:text-gray-100 break-all",
          valueClassName
        )}>
          {value || '-'}
        </span>
        {copyable && value && (
          <CopyButton text={stringValue} size="sm" />
        )}
      </div>
    </div>
  );
}
