
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, AlertTriangle, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/search/EmptyState';

import type { Deployment } from '@/lib/rulePacks';

interface DeploymentHistoryProps {
  tenantId: number;
  packId?: string;
}

export function DeploymentHistory({ tenantId, packId }: DeploymentHistoryProps) {
  // For now, mock deployments - in real app would fetch from API
  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments', tenantId, packId],
    queryFn: async () => {
      // TODO: Implement actual API call
      return [] as Deployment[];
    },
    staleTime: 5 * 60 * 1000,
  });
  
  const getStatusIcon = (status: Deployment['status']) => {
    switch (status) {
      case 'APPLIED':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'PLANNED':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'CANCELED':
        return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };
  
  const getStatusColor = (status: Deployment['status']) => {
    switch (status) {
      case 'APPLIED':
        return 'green';
      case 'FAILED':
        return 'red';
      case 'PLANNED':
        return 'blue';
      case 'CANCELED':
        return 'gray';
    }
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deployment History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!deployments || deployments.length === 0) {
    return (
      <Card>
        <CardContent className="p-12">
          <EmptyState
            icon={<Package className="w-12 h-12" />}
            title="No deployments yet"
            description="Deploy a rule pack to see the history here"
          />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployment History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deploy ID</TableHead>
              <TableHead>Pack</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Changes</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deployments.map((deployment) => {
              const duration = deployment.finished_at
                ? new Date(deployment.finished_at).getTime() - new Date(deployment.started_at).getTime()
                : null;
              
              return (
                <TableRow
                  key={deployment.deploy_id}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <TableCell className="font-mono text-sm">
                    {deployment.deploy_id.substring(0, 8)}...
                  </TableCell>
                  <TableCell>{deployment.pack_id.substring(0, 8)}...</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(deployment.status)}
                      <Badge variant={getStatusColor(deployment.status) as any}>
                        {deployment.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-green-600">+{deployment.created}</span>
                      <span className="text-blue-600">~{deployment.updated}</span>
                      <span className="text-red-600">-{deployment.disabled}</span>
                      <span className="text-gray-500">={deployment.skipped}</span>
                    </div>
                  </TableCell>
                  <TableCell>{deployment.actor}</TableCell>
                  <TableCell>
                    {new Date(deployment.started_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {duration ? `${Math.round(duration / 1000)}s` : '-'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
