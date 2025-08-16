"use client";
import { 
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import * as React from "react";

export interface ActionMenuItemProps extends 
  Omit<React.ComponentProps<typeof DropdownMenuItem>, 'onSelect'> {
  "data-action": string;
  "data-intent"?: "api"|"navigate"|"open-modal"|"submit";
  "data-endpoint"?: string;
  "data-danger"?: "true"|"false";
  onSelect?: (event: Event) => void;
}

/**
 * ActionMenuItem - A DropdownMenuItem wrapper that enforces action metadata
 * 
 * Similar to ActionButton but for dropdown menu items. Validates that all
 * menu items have proper action handlers and metadata.
 * 
 * @example
 * <ActionMenuItem 
 *   data-action="rules:item:delete"
 *   data-intent="api"
 *   data-endpoint="/api/v2/rules"
 *   data-danger="true"
 *   onSelect={handleDeleteRule}
 * >
 *   Delete Rule
 * </ActionMenuItem>
 */
export function ActionMenuItem(props: ActionMenuItemProps) {
  if (process.env.NODE_ENV !== "production") {
    const { 
      onSelect,
      ["data-intent"]: intent, 
      ["data-endpoint"]: endpoint,
      ["data-action"]: action
    } = props;
    
    if (!onSelect) {
      console.warn(`ActionMenuItem missing onSelect handler: ${action}`, {
        action,
        intent,
        endpoint
      });
    }
    
    if (intent === "api" && !endpoint) {
      console.warn(`ActionMenuItem(api) missing data-endpoint: ${action}`, {
        action,
        intent,
        endpoint
      });
    }
    
    if (!action) {
      console.warn("ActionMenuItem missing data-action attribute", props);
    }
  }
  
  // Pass through all props including onSelect to the underlying DropdownMenuItem
  return (
    <DropdownMenuItem 
      {...props} 
      onSelect={props.onSelect}
      data-action={props['data-action'] || 'wrapper:action-menu-item:render'}
    />
  );
}
