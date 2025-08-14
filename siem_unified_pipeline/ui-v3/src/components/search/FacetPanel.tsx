"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Filter } from "lucide-react";

export interface FacetBucket { value: string; count: number }

export function FacetPanel({ facets, onToggle }: { facets?: Record<string, FacetBucket[]>; onToggle: (field: string, value: string) => void }) {
  if (!facets || Object.keys(facets).length === 0) {
    return (
      <Card className="w-80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter className="h-4 w-4" />
            Facets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No facets available. Run a search to see field breakdowns.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Filter className="h-4 w-4" />
          Facets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(facets).map(([field, buckets]) => (
          <div key={field} className="space-y-2">
            <h4 className="text-sm font-medium capitalize">{field.replace('_', ' ')}</h4>
            <div data-testid={`facet-${field}`} className="space-y-1">
              {buckets.slice(0, 10).map((bucket) => (
                <div
                  key={`${field}-${bucket.value}`}
                  onClick={() => onToggle(field, bucket.value)}
                  className="flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm truncate flex-1 mr-2">
                    {bucket.value || "(empty)"}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {bucket.count.toLocaleString()}
                  </Badge>
                </div>
              ))}
              {buckets.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{buckets.length - 10} more values
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}


