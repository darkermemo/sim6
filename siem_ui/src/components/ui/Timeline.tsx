
import { cn } from '@/lib/utils';
import { Badge } from './Badge';

export interface TimelineEvent {
  id: string;
  type: 'created' | 'status_change' | 'note_added' | 'assignee_change';
  timestamp: string;
  title: string;
  description?: string;
  user?: string;
  oldValue?: string;
  newValue?: string;
}

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

/**
 * Timeline component for displaying chronological events
 * Used in alert detail drawer to show activity history
 */
export function Timeline({ events, className }: TimelineProps) {
  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'created':
        return '🔴';
      case 'status_change':
        return '🔄';
      case 'note_added':
        return '💬';
      case 'assignee_change':
        return '👤';
      default:
        return '•';
    }
  };

  const getEventBadgeVariant = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'created':
        return 'critical';
      case 'status_change':
        return 'info';
      case 'note_added':
        return 'default';
      case 'assignee_change':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  if (events.length === 0) {
    return (
      <div className={cn('text-center py-8', className)}>
        <p className="text-secondary-text">No timeline events available</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {events.map((event, index) => (
        <div key={event.id} className="relative">
          {/* Timeline line */}
          {index < events.length - 1 && (
            <div className="absolute left-6 top-12 bottom-0 w-px bg-border" />
          )}
          
          {/* Event container */}
          <div className="flex items-start space-x-4">
            {/* Event icon */}
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-slate-800 border border-border flex items-center justify-center text-lg">
              {getEventIcon(event.type)}
            </div>
            
            {/* Event content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <h4 className="text-sm font-medium text-primary-text">
                  {event.title}
                </h4>
                <Badge variant={getEventBadgeVariant(event.type) as any} className="text-xs">
                  {event.type.replace('_', ' ')}
                </Badge>
              </div>
              
              {event.description && (
                <p className="text-sm text-secondary-text mb-2">
                  {event.description}
                </p>
              )}
              
              {/* Value change display */}
              {event.oldValue && event.newValue && (
                <div className="text-xs text-secondary-text mb-2">
                  <span className="line-through text-red-400">{event.oldValue}</span>
                  <span className="mx-2">→</span>
                  <span className="text-green-400">{event.newValue}</span>
                </div>
              )}
              
              {/* Metadata */}
              <div className="flex items-center space-x-4 text-xs text-secondary-text">
                <span>{formatTimestamp(event.timestamp)}</span>
                {event.user && (
                  <span>by {event.user}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
} 