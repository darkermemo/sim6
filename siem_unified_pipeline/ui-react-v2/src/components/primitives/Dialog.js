import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Enterprise Dialog Component with Radix Primitives
 * Provides accessible modal dialogs with keyboard navigation
 */
import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (_jsx(DialogPrimitive.Overlay, { ref: ref, className: `fixed inset-0 z-[var(--z-modal)] bg-black/50 backdrop-blur-sm transition-opacity duration-[var(--duration-normal)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ${className || ''}`, ...props })));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (_jsxs(DialogPortal, { children: [_jsx(DialogOverlay, {}), _jsx(DialogPrimitive.Content, { ref: ref, className: `fixed left-[50%] top-[50%] z-[var(--z-modal)] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-[var(--border-default)] bg-[var(--bg-canvas)] p-6 shadow-[var(--shadow-4)] duration-[var(--duration-normal)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg ${className || ''}`, ...props, children: children })] })));
DialogContent.displayName = DialogPrimitive.Content.displayName;
const DialogHeader = ({ className, ...props }) => (_jsx("div", { className: `flex flex-col space-y-1.5 text-center sm:text-left ${className || ''}`, ...props }));
DialogHeader.displayName = 'DialogHeader';
const DialogFooter = ({ className, ...props }) => (_jsx("div", { className: `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className || ''}`, ...props }));
DialogFooter.displayName = 'DialogFooter';
const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (_jsx(DialogPrimitive.Title, { ref: ref, className: `text-lg font-semibold leading-none tracking-tight text-[var(--fg-default)] ${className || ''}`, ...props })));
DialogTitle.displayName = DialogPrimitive.Title.displayName;
const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (_jsx(DialogPrimitive.Description, { ref: ref, className: `text-sm text-[var(--fg-muted)] ${className || ''}`, ...props })));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
const DialogClose = DialogPrimitive.Close;
export { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose, };
