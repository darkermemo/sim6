import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useTenants } from '@/hooks/useTenants';
import { Badge } from '@/components/ui/Badge';
import { Building2, Users } from 'lucide-react';

interface TenantFilterProps {
  value?: string;
  onChange: (tenantId: string | undefined) => void;
  placeholder?: string;
  showAllOption?: boolean;
  className?: string;
  disabled?: boolean;
}

export const TenantFilter: React.FC<TenantFilterProps> = ({
  value,
  onChange,
  placeholder = "Select tenant...",
  showAllOption = true,
  className,
  disabled = false
}) => {
  const { tenants, loading, error } = useTenants();

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Error loading tenants
      </div>
    );
  }

  return (
    <Select
      value={value || ""}
      onValueChange={(val) => onChange(val === "all" ? undefined : val)}
      disabled={disabled || loading}
    >
      <SelectTrigger className={className}>
        <div className="flex items-center space-x-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder={loading ? "Loading..." : placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {showAllOption && (
          <SelectItem value="all">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>All Tenants</span>
            </div>
          </SelectItem>
        )}
        {tenants.map((tenant) => (
          <SelectItem key={tenant.tenant_id} value={tenant.tenant_id}>
            <div className="flex items-center justify-between w-full">
              <span>{tenant.tenant_name}</span>
              <Badge 
                variant={tenant.is_active ? "default" : "secondary"}
                className="ml-2"
              >
                {tenant.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </SelectItem>
        ))}
        {tenants.length === 0 && !loading && (
          <SelectItem value="no-tenants" disabled>
            No tenants available
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};

export default TenantFilter;