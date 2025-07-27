import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, title, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-border bg-card p-6 shadow-sm",
          className
        )}
        {...props}
      >
        {title && (
          <h3 className="text-lg font-semibold text-primary-text mb-4">
            {title}
          </h3>
        )}
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export { Card }; 