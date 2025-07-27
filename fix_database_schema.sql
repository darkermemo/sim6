-- Fix database schema by adding missing columns

-- Add missing columns to rules table
ALTER TABLE dev.rules ADD COLUMN IF NOT EXISTS rule_description String DEFAULT '';
ALTER TABLE dev.rules ADD COLUMN IF NOT EXISTS is_stateful UInt8 DEFAULT 0;
ALTER TABLE dev.rules ADD COLUMN IF NOT EXISTS stateful_config String DEFAULT '';
ALTER TABLE dev.rules ADD COLUMN IF NOT EXISTS engine_type String DEFAULT 'scheduled';

-- Add missing columns to alerts table
ALTER TABLE dev.alerts ADD COLUMN IF NOT EXISTS rule_name String DEFAULT '';
ALTER TABLE dev.alerts ADD COLUMN IF NOT EXISTS alert_timestamp UInt32 DEFAULT 0;

-- Drop old columns that are no longer needed
-- Note: ClickHouse doesn't support dropping columns easily, so we'll work with what we have

-- Update existing data to set alert_timestamp from created_at if needed
-- This will be handled by the application logic