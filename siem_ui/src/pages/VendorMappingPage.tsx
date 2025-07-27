import { VendorLogSourceMapping } from '@/components/VendorLogSourceMapping';

/**
 * VendorMappingPage - Page component for vendor log source mapping
 * 
 * This page provides a comprehensive interface for viewing and managing
 * vendor-specific log source parsers, field mappings, and configurations.
 * 
 * Features:
 * - Browse 22+ pre-configured vendor parsers
 * - View sample logs and field mappings
 * - Copy Grok patterns and ClickHouse DDL
 * - Filter by category and complexity
 * - Export parser configurations
 * 
 * @example
 * <VendorMappingPage />
 */
export function VendorMappingPage() {
  return (
    <div className="container mx-auto py-6">
      <VendorLogSourceMapping />
    </div>
  );
}

export default VendorMappingPage;