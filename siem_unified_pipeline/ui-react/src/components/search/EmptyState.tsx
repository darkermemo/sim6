import { Search, Database, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  type: 'no-tenant' | 'no-results' | 'error';
  error?: string;
  onRetry?: () => void;
  onLoadDemo?: () => void;
}

export function EmptyState({ type, error, onRetry, onLoadDemo }: EmptyStateProps) {
  if (type === 'no-tenant') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <Database className="w-12 h-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Choose a tenant to start
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
          Select a tenant from the dropdown above to begin searching your security events.
        </p>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Search Error
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mb-4">
          {error || 'An error occurred while searching'}
        </p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline">
            Try Again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <Search className="w-12 h-12 text-gray-400 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        No results found
      </h3>
      <p className="text-gray-600 dark:text-gray-400 max-w-md mb-4">
        Try adjusting your search query or time range. Here are some example queries:
      </p>
      <div className="space-y-2 mb-6">
        <code className="block text-sm bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded">
          message:"failed" AND user:alice
        </code>
        <code className="block text-sm bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded">
          severity:high AND source:firewall
        </code>
        <code className="block text-sm bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded">
          event_type:login AND result:failure
        </code>
      </div>
      {onLoadDemo && (
        <Button onClick={onLoadDemo} variant="outline">
          Load Demo Data
        </Button>
      )}
    </div>
  );
}
