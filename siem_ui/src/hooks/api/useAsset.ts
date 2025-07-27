import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { assetsApi } from '@/services/api';
import type { AssetInfo } from '@/types/api';

/**
 * Hook to fetch asset information by IP with debouncing
 * Used for tooltip data on hover
 */
export function useAsset(ip: string | null, enabled: boolean = true) {
  const [debouncedIp, setDebouncedIp] = useState<string | null>(null);

  // Debounce IP changes to avoid excessive API calls
  useEffect(() => {
    if (!ip || !enabled) {
      setDebouncedIp(null);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedIp(ip);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [ip, enabled]);

  const {
    data,
    error,
    isLoading,
    isValidating
  } = useSWR<AssetInfo>(
    debouncedIp ? ['asset', debouncedIp] : null,
    () => assetsApi.getAssetByIp(debouncedIp!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // Cache for 1 minute
      errorRetryCount: 1,
      shouldRetryOnError: false, // Don't retry on 404 for non-existent assets
    }
  );

  return {
    /** Asset information from API */
    data,
    /** Loading state */
    isLoading: isLoading || (!!debouncedIp && !data && !error),
    /** Error object if request failed */
    error,
    /** Whether asset data exists */
    hasAsset: !!data,
    /** Whether currently fetching */
    isFetching: isValidating,
  };
}

/**
 * Hook for batch asset fetching (for multiple IPs)
 * Useful when loading multiple tooltips at once
 */
export function useAssets(ips: string[], enabled: boolean = true) {
  const results = ips.map(ip => useAsset(ip, enabled));

  return {
    /** Map of IP to asset data */
    assets: Object.fromEntries(
      ips.map((ip, index) => [ip, results[index].data]).filter(([, data]) => data)
    ),
    /** Whether any requests are loading */
    isLoading: results.some(result => result.isLoading),
    /** Whether any requests have errors */
    hasErrors: results.some(result => result.error),
    /** Array of all errors */
    errors: results.map(result => result.error).filter(Boolean),
  };
} 