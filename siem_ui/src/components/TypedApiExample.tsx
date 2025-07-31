/**
 * Example component demonstrating the usage of the new typed API client
 * This shows how to use the generated OpenAPI types for full type safety
 */
import { useTypedLogSources, useCreateLogSource, useDeleteLogSource } from '@/hooks/api/useTypedLogSources';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import type { CreateLogSourceRequest } from '@/services/typedApi';

/**
 * Example component showing typed API usage
 */
export function TypedApiExample() {
  // Use the typed hook - all return types are fully typed from OpenAPI spec
  const { data: logSourcesData, isLoading, error, refetch } = useTypedLogSources();
  const createMutation = useCreateLogSource();
  const deleteMutation = useDeleteLogSource();

  // Example of creating a log source with full type safety
  const handleCreateExample = async () => {
    // TypeScript will enforce the correct structure based on OpenAPI schema
    const newLogSource: CreateLogSourceRequest = {
      source_name: 'Example Syslog Server',
      source_ip: '192.168.1.100',
      source_type: 'Syslog',
    };

    try {
      await createMutation.mutateAsync(newLogSource);
    } catch (error) {
      console.error('Failed to create log source:', error);
    }
  };

  // Example of deleting a log source
  const handleDelete = async (sourceId: string) => {
    if (!confirm('Are you sure you want to delete this log source?')) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(sourceId);
    } catch (error) {
      console.error('Failed to delete log source:', error);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading log sources...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-destructive mb-2">Error</h3>
          <p className="text-muted-foreground mb-4">
            Failed to load log sources: {error.message}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  // TypeScript knows the exact structure of logSourcesData from OpenAPI types
  const logSources = logSourcesData?.log_sources || [];
  const total = logSourcesData?.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Typed API Example</h2>
          <p className="text-muted-foreground">
            Demonstrating type-safe API calls with OpenAPI-generated types
          </p>
        </div>
        
        <Button 
          onClick={handleCreateExample}
          disabled={createMutation.isPending}
          className="flex items-center gap-2"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Create Example Source
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b">
          <h3 className="font-semibold">Log Sources ({total})</h3>
          <p className="text-sm text-muted-foreground">
            All data types are enforced by TypeScript based on the OpenAPI specification
          </p>
        </div>
        
        <div className="divide-y">
          {logSources.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No log sources found. Create one to see the typed API in action!
            </div>
          ) : (
            logSources.map((source) => (
              <div key={source.source_id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-medium">{source.source_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {source.source_ip} • ID: {source.source_id.slice(0, 8)}...
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {source.source_type}
                  </Badge>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(source.source_id)}
                    disabled={deleteMutation.isPending}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Type Safety Demonstration */}
      <Card className="p-4">
        <h3 className="font-semibold mb-2">Type Safety Benefits</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>✅ All API request/response types are automatically generated from OpenAPI spec</p>
          <p>✅ TypeScript catches type mismatches at compile time</p>
          <p>✅ IDE provides full autocomplete for API data structures</p>
          <p>✅ Refactoring is safe - breaking changes are caught immediately</p>
          <p>✅ No manual type definitions needed - always in sync with backend</p>
        </div>
      </Card>
    </div>
  );
}

export default TypedApiExample;