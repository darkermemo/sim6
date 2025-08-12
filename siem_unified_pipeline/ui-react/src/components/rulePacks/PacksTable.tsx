
import { Package, Clock, FileText, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { cn } from '@/lib/utils';
import type { RulePack } from '@/lib/rulePacks';

interface PacksTableProps {
  packs: RulePack[];
  selectedPackId?: string;
  onPackSelect: (pack: RulePack) => void;
  onCreatePlan: (strategy: 'safe' | 'force', matchBy?: 'rule_id' | 'name') => void;
}

export function PacksTable({ packs, selectedPackId, onPackSelect, onCreatePlan }: PacksTableProps) {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Rules</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Uploader</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {packs.map((pack) => (
            <TableRow
              key={pack.pack_id}
              className={cn(
                "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800",
                selectedPackId === pack.pack_id && "bg-gray-50 dark:bg-gray-800"
              )}
              onClick={() => onPackSelect(pack)}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-400" />
                  {pack.name}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{pack.version}</Badge>
              </TableCell>
              <TableCell>{pack.items}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  <FileText className="w-3 h-3 mr-1" />
                  {pack.source}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Clock className="w-3 h-3" />
                  {new Date(pack.uploaded_at).toLocaleDateString()}
                </div>
              </TableCell>
              <TableCell>{pack.uploader}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onCreatePlan('safe')}>
                      Create Safe Plan
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCreatePlan('force')}>
                      Create Force Plan
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>View Items</DropdownMenuItem>
                    <DropdownMenuItem>Download Pack</DropdownMenuItem>
                    <DropdownMenuItem>View History</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
