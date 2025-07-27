import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(unix_ts: number): string {
  // Check if the input unix_ts is greater than a reasonable value
  if (!unix_ts || unix_ts <= 0 || unix_ts < 1000000000) {
    return "N/A";
  }
  
  const date = new Date(unix_ts * 1000);
  
  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return "Invalid Date";
  }
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'bg-severity-critical';
    case 'high':
      return 'bg-severity-high';
    case 'medium':
      return 'bg-severity-medium';
    case 'low':
      return 'bg-severity-low';
    case 'informational':
    case 'info':
      return 'bg-severity-info';
    default:
      return 'bg-primary';
  }
}