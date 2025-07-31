import useSWR from 'swr';
import { validatedFetch } from '../useValidatedApi';
import { z } from 'zod';

// Zod schema for asset
const AssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.string(),
  ip_address: z.string().optional(),
  hostname: z.string().optional(),
  os: z.string().optional(),
  status: z.enum(['active', 'inactive', 'unknown']),
  last_seen: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
}).transform((data) => ({
  id: data.id,
  name: data.name,
  type: data.type,
  ipAddress: data.ip_address,
  hostname: data.hostname,
  os: data.os,
  status: data.status,
  lastSeen: data.last_seen,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
}));

type Asset = z.infer<typeof AssetSchema>;

/**
 * Hook to fetch asset information
 * Uses SWR for caching and automatic revalidation with Zod validation
 */
export function useAsset(assetId: string | null) {
  const key = assetId ? ['asset', assetId] : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<Asset>(
    assetId ? key : null,
    () => fetchAsset(assetId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  return {
    /** Asset data from API */
    data,
    /** Loading state - true during initial load */
    isLoading,
    /** Validating state - true during background refresh */
    isValidating,
    /** Error object if request failed */
    error,
    /** Whether data is empty/null */
    isEmpty: !data,
    /** Manual refresh function */
    refresh: mutate,
    /** Whether currently refreshing */
    isRefreshing: isValidating && !!data,
  };
}

/**
 * Fetch asset from API with Zod validation
 * Uses the updated VITE_API_BASE environment variable
 */
async function fetchAsset(assetId: string): Promise<Asset> {
  const token = localStorage.getItem('access_token');
  return validatedFetch(
    `/assets/${assetId}`,
    AssetSchema,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );
}

/**
 * Hook for loading multiple assets by ID
 * Useful when loading multiple assets at once
 */
export function useAssets(assetIds: string[]) {
  const {
    data,
    error,
    isLoading,
  } = useSWR<Asset[]>(
    assetIds.length > 0 ? ['assets', ...assetIds.sort()] : null,
    () => Promise.all(assetIds.map(id => fetchAsset(id))),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
      errorRetryCount: 1,
      shouldRetryOnError: false,
    }
  );

  return {
    /** Assets data indexed by ID */
    data: data?.reduce((acc, asset, index) => {
      if (asset) {
        acc[assetIds[index]] = asset;
      }
      return acc;
    }, {} as Record<string, Asset>) || {},
    /** Loading state */
    isLoading,
    /** Error object if request failed */
    error,
  };
}