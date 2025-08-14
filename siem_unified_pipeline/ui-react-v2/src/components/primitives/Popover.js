import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Enterprise Popover Component with Radix Primitives
 * Provides accessible floating content with focus management
 */
import React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverContent = React.forwardRef(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (_jsx(PopoverPrimitive.Portal, { children: _jsx(PopoverPrimitive.Content, { ref: ref, align: align, sideOffset: sideOffset, className: `z-[var(--z-popover)] w-72 rounded-md border border-[var(--border-default)] bg-[var(--bg-canvas)] p-4 text-[var(--fg-default)] shadow-[var(--shadow-3)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ${className || ''}`, ...props }) })));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
const PopoverClose = PopoverPrimitive.Close;
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverClose };
