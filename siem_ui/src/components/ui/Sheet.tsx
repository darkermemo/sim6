import React from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface SheetContentProps {
  className?: string;
  children: React.ReactNode;
  side?: 'left' | 'right' | 'top' | 'bottom';
}

interface SheetHeaderProps {
  className?: string;
  children: React.ReactNode;
  onClose?: () => void;
  showCloseButton?: boolean;
}

interface SheetTitleProps {
  className?: string;
  children: React.ReactNode;
}

interface SheetDescriptionProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Sheet - Slide-over drawer component
 * 
 * A modal dialog that slides in from the side of the screen.
 * Used for detailed views like rule information or alert investigation.
 * 
 * @example
 * <Sheet open={isOpen} onOpenChange={setIsOpen}>
 *   <SheetContent>
 *     <SheetHeader>
 *       <SheetTitle>Rule Details</SheetTitle>
 *       <SheetDescription>View and manage rule settings</SheetDescription>
 *     </SheetHeader>
 *   </SheetContent>
 * </Sheet>
 */
export function Sheet({ open, onOpenChange, children }: SheetProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenChange(false);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Close sheet"
      />
      
      {/* Sheet container */}
      <div className="fixed inset-0 flex items-center justify-end">
        {children}
      </div>
    </div>
  );
}

export function SheetContent({ className, children, side = 'right' }: SheetContentProps) {
  const sideClasses = {
    right: 'slide-in-from-right border-l',
    left: 'slide-in-from-left border-r',
    top: 'slide-in-from-top border-b',
    bottom: 'slide-in-from-bottom border-t'
  };

  return (
    <div 
      role="dialog" 
      aria-modal="true"
      className={clsx(
        'relative bg-white dark:bg-gray-900 shadow-xl h-full animate-in duration-300',
        'overflow-hidden border-gray-200 dark:border-gray-700',
        sideClasses[side],
        className
      )}
    >
      {children}
    </div>
  );
}

export function SheetHeader({ className, children, onClose, showCloseButton = true }: SheetHeaderProps) {
  return (
    <div className={clsx('flex-shrink-0 relative', className)}>
      {children}
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          className="absolute top-0 right-0 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export function SheetTitle({ className, children }: SheetTitleProps) {
  return (
    <h2 className={clsx('text-lg font-semibold text-gray-900 dark:text-gray-100', className)}>
      {children}
    </h2>
  );
}

export function SheetDescription({ className, children }: SheetDescriptionProps) {
  return (
    <p className={clsx('text-sm text-gray-600 dark:text-gray-400', className)}>
      {children}
    </p>
  );
}