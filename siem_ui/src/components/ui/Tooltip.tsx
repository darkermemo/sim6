import { useState } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}

export function Tooltip({ children, content, className }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      
      {isVisible && (
        <div className={cn(
          "absolute z-50 px-3 py-2 text-sm text-primary-text bg-card border border-border rounded-md shadow-lg whitespace-nowrap",
          "bottom-full left-1/2 transform -translate-x-1/2 mb-2",
          className
        )}>
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-card" />
        </div>
      )}
    </div>
  );
} 