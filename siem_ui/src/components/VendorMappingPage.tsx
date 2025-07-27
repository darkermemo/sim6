import { VendorLogSourceMapping } from './VendorLogSourceMapping';

/**
 * VendorMappingPage - Main page component for vendor log source mapping
 * 
 * This page provides a comprehensive interface for viewing and managing
 * vendor-specific log source parsers, field mappings, and configurations.
 * 
 * Features:
 * - Interactive vendor browser with search and filtering
 * - Ready-to-use parser configurations for 22+ vendors
 * - ClickHouse schema mappings and UI filter chips
 * - Copy-paste ready Grok patterns and field extractions
 * 
 * @example
 * <VendorMappingPage />
 */
export function VendorMappingPage() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl">
        <VendorLogSourceMapping />
      </div>
    </div>
  );
}

export default VendorMappingPage;