import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Enterprise Button Component with Radix Primitives
 * Provides accessible, consistent button patterns
 */
import React from 'react';
import { cva } from 'class-variance-authority';
const buttonVariants = cva('inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', {
    variants: {
        variant: {
            default: 'bg-[var(--color-primary)] text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]',
            destructive: 'bg-[var(--color-danger)] text-[var(--color-danger-fg)] hover:bg-[var(--color-danger-hover)]',
            outline: 'border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-accent)] hover:text-[var(--fg-accent)]',
            secondary: 'bg-[var(--bg-accent)] text-[var(--fg-accent)] hover:bg-[var(--bg-accent-hover)]',
            ghost: 'hover:bg-[var(--bg-accent)] hover:text-[var(--fg-accent)]',
            link: 'text-[var(--color-primary)] underline-offset-4 hover:underline',
        },
        size: {
            default: 'h-10 px-4 py-2',
            sm: 'h-9 rounded-md px-3',
            lg: 'h-11 rounded-md px-8',
            icon: 'h-10 w-10',
        },
    },
    defaultVariants: {
        variant: 'default',
        size: 'default',
    },
});
const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
    return (_jsx("button", { className: buttonVariants({ variant, size, className }), ref: ref, ...props }));
});
Button.displayName = 'Button';
export { Button, buttonVariants };
