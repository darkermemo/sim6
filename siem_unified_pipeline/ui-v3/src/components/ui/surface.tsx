import { cn } from "@/lib/utils";
import * as React from "react";

export function Surface({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn(
        "bg-card text-card-foreground border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl", 
        className
      )} 
      {...props} 
    />
  );
}
