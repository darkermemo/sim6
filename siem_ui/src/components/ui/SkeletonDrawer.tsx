
import { Skeleton } from './Skeleton';
import { cn } from '@/lib/utils';

interface SkeletonDrawerProps {
  className?: string;
}

/**
 * SkeletonDrawer - Loading skeleton for drawer components
 * 
 * Displays animated placeholders while drawer content is loading.
 * Matches the structure of actual drawer components for smooth transitions.
 * 
 * @example
 * <SkeletonDrawer />
 */
export function SkeletonDrawer() {
  return (
    <div data-testid="skeleton-drawer" className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-4 pb-6 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1 mr-4">
            <div className="h-6 bg-gray-200 rounded-md w-3/4 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded-md w-1/2 animate-pulse" />
          </div>
          <div className="h-8 w-8 bg-gray-200 rounded-md animate-pulse" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
          </div>
          <div className="flex items-center space-x-2">
            <div className="h-8 w-16 bg-gray-200 rounded-md animate-pulse" />
            <div className="h-8 w-20 bg-gray-200 rounded-md animate-pulse" />
          </div>
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="space-y-4">
        <div className="flex space-x-6 border-b border-border">
          <div className="h-8 w-20 bg-gray-200 rounded-t-md animate-pulse" />
          <div className="h-8 w-16 bg-gray-200 rounded-t-md animate-pulse" />
          <div className="h-8 w-24 bg-gray-200 rounded-t-md animate-pulse" />
          <div className="h-8 w-18 bg-gray-200 rounded-t-md animate-pulse" />
        </div>

        {/* Content skeleton */}
        <div className="space-y-6">
          {/* Two column grid */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4 p-4 border border-border rounded-md">
              <div className="h-5 bg-gray-200 rounded-md w-1/2 animate-pulse" />
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="h-3 bg-gray-200 rounded-md w-1/3 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded-md w-2/3 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <div className="h-3 bg-gray-200 rounded-md w-1/3 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded-md w-1/2 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <div className="h-3 bg-gray-200 rounded-md w-1/4 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded-md w-3/4 animate-pulse" />
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 border border-border rounded-md">
              <div className="h-5 bg-gray-200 rounded-md w-2/3 animate-pulse" />
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="h-3 bg-gray-200 rounded-md w-1/3 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded-md w-1/2 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <div className="h-3 bg-gray-200 rounded-md w-2/5 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded-md w-4/5 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <div className="h-3 bg-gray-200 rounded-md w-1/4 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded-md w-1/3 animate-pulse" />
                </div>
              </div>
            </div>
          </div>

          {/* Description card skeleton */}
          <div className="space-y-4 p-4 border border-border rounded-md">
            <div className="h-5 bg-gray-200 rounded-md w-1/4 animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded-md w-full animate-pulse" />
              <div className="h-4 bg-gray-200 rounded-md w-3/4 animate-pulse" />
              <div className="h-4 bg-gray-200 rounded-md w-1/2 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for notes tab
 */
export function SkeletonNotesTab({ className }: SkeletonDrawerProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Add note form skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-20" />
      </div>

      <div className="border-t border-border pt-4">
        <Skeleton className="h-4 w-32 mb-4" />
        
        {/* Notes list skeleton */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for raw tab (Monaco editor)
 */
export function SkeletonRawTab({ className }: SkeletonDrawerProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

/**
 * Skeleton for timeline tab
 */
export function SkeletonTimelineTab({ className }: SkeletonDrawerProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start space-x-4">
          <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
} 