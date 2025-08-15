import { Search, Play, Radio, Save, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QueryBarProps {
  tenant?: string;
  query: string;
  isLoading?: boolean;
  onQueryChange: (query: string) => void;
  onCompile: () => void;
  onRun: () => void;
  onTail: () => void;
  onSave: () => void;
  onExport: () => void;
}

export function QueryBar({
  tenant,
  query,
  isLoading,
  onQueryChange,
  onCompile,
  onRun,
  onTail,
  onSave,
  onExport,
}: QueryBarProps) {
  const canRun = Boolean(tenant);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="space-y-4">
        {/* Query Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder='Enter your search query (e.g., message:"failed" AND user:alice)'
            className={cn(
              "w-full pl-10 pr-4 py-3 border rounded-lg",
              "bg-white dark:bg-gray-700",
              "border-gray-300 dark:border-gray-600",
              "text-gray-900 dark:text-gray-100",
              "placeholder-gray-500 dark:placeholder-gray-400",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              !canRun && "opacity-50 cursor-not-allowed"
            )}
            disabled={!canRun}
          />
        </div>

        {/* Helper text when no tenant selected */}
        {!tenant && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Choose a tenant from the top bar to enable search
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onCompile}
            variant="outline"
            disabled={!canRun || isLoading}
          >
            Compile
          </Button>
          
          <Button
            onClick={onRun}
            variant="default"
            disabled={!canRun || isLoading}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            Run Search
          </Button>

          <Button
            onClick={onTail}
            variant="outline"
            disabled={!canRun || isLoading}
            className="gap-2"
          >
            <Radio className="w-4 h-4" />
            Tail
          </Button>

          <div className="ml-auto flex gap-2">
            <Button
              onClick={onSave}
              variant="ghost"
              disabled={!canRun || !query}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Save Search
            </Button>

            <Button
              onClick={onExport}
              variant="ghost"
              disabled={!canRun || isLoading}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
