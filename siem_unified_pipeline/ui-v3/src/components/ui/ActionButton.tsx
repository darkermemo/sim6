"use client";
import { Button, type ButtonProps } from "@/components/ui/button";

export interface ActionButtonProps extends ButtonProps {
  "data-action": string;
  "data-intent"?: "api"|"navigate"|"open-modal"|"submit";
  "data-endpoint"?: string;
  "data-danger"?: "true"|"false";
}

/**
 * ActionButton - A Button wrapper that enforces action metadata and runtime validation
 * 
 * This component ensures all actionable buttons have proper wiring and metadata
 * for audit tracking and e2e testing. In development, it warns about missing
 * handlers or incomplete action metadata.
 * 
 * @example
 * <ActionButton 
 *   data-action="search:filters:apply"
 *   data-intent="api"
 *   data-endpoint="/api/v2/search"
 *   onClick={handleApplyFilters}
 * >
 *   Apply Filters
 * </ActionButton>
 */
export function ActionButton(props: ActionButtonProps) {
  if (process.env.NODE_ENV !== "production") {
    const { 
      onClick, 
      href, 
      type, 
      ["data-intent"]: intent, 
      ["data-endpoint"]: endpoint,
      ["data-action"]: action
    } = props as any;
    
    const hasHandler = Boolean(onClick || href || type === "submit");
    
    if (!hasHandler) {
      console.warn(`ActionButton missing handler/nav: ${action}`, {
        action,
        intent,
        endpoint,
        hasOnClick: Boolean(onClick),
        hasHref: Boolean(href),
        isSubmit: type === "submit"
      });
    }
    
    if (intent === "api" && !endpoint) {
      console.warn(`ActionButton(api) missing data-endpoint: ${action}`, {
        action,
        intent,
        endpoint
      });
    }
    
    if (!action) {
      console.warn("ActionButton missing data-action attribute", props);
    }
  }
  
  // Pass through all props including onClick to the underlying Button
  return (
    <Button 
      {...props} 
      onClick={props.onClick}
      data-action={props['data-action'] || 'wrapper:action-button:render'}
    />
  );
}
