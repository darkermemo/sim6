import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAssetApi } from '@/hooks/useApi';

interface AssetTooltipProps {
  ip: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Asset tooltip component that fetches asset information on hover
 * Uses debounced API calls to avoid excessive requests
 */
export function AssetTooltip({ ip, children, className }: AssetTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { data: assetInfo, isLoading } = useAssetApi(
    isHovered ? ip : null
  );

  const TooltipContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading asset info...</span>
        </div>
      );
    }

    if (!assetInfo) {
      return (
        <div className="space-y-1">
          <div><span className="font-medium">IP:</span> {ip}</div>
          <div className="text-secondary-text text-xs">No asset information available</div>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <div><span className="font-medium">Asset:</span> {assetInfo.name}</div>
        <div><span className="font-medium">Status:</span> 
          <span className={`ml-1 ${ 
            assetInfo.status === 'active' ? 'text-green-600' : 
            assetInfo.status === 'inactive' ? 'text-red-600' : 
            'text-yellow-600' 
          }`}> 
            {assetInfo.status} 
          </span> 
        </div>
        <div><span className="font-medium">Type:</span> {assetInfo.type}</div>
        <div className="text-secondary-text text-xs">IP: {ip}</div>
      </div>
    );
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Tooltip content={<TooltipContent />}>
        {children || (
          <Shield className={`h-4 w-4 text-secondary-text hover:text-accent cursor-help transition-colors ${className}`} />
        )}
      </Tooltip>
    </div>
  );
}