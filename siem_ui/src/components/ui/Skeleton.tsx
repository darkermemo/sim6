import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-border', className)}
      {...props}
    />
  );
}

/**
 * KPI Card skeleton matching exact layout
 */
function KpiCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-20" />
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

/**
 * Chart skeleton matching chart container
 */
function ChartSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm h-96">
      <h3 className="text-lg font-semibold text-primary-text mb-4">
        {title}
      </h3>
      <Skeleton className="w-full h-72" />
    </div>
  );
}

/**
 * Table row skeleton for alerts table
 */
function TableRowSkeleton() {
  return (
    <tr className="border-b border-border">
      <td className="py-3 px-4">
        <Skeleton className="h-6 w-16 rounded-full" />
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-4 w-48" />
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </div>
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-4 w-16" />
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-6 w-20 rounded-full" />
      </td>
    </tr>
  );
}

/**
 * Full table skeleton for alerts
 */
function AlertsTableSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm overflow-hidden">
      <h3 className="text-lg font-semibold text-primary-text mb-4">
        Recent Alerts
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Severity
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Timestamp
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Alert Name
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Source IP
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Destination IP
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                User
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { Skeleton, KpiCardSkeleton, ChartSkeleton, AlertsTableSkeleton }; 