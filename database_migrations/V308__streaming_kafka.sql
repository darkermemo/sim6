-- V308__streaming_kafka.sql
-- Streaming/Kafka support tables

-- Dead-letter queue
CREATE TABLE IF NOT EXISTS dev.ingest_dlq (
  tenant_id UInt64,
  source_id String,
  received_at DateTime64(3) DEFAULT now64(3),
  reason LowCardinality(String),
  raw String
) ENGINE=ReplacingMergeTree ORDER BY (tenant_id, received_at);

-- Optional: consumer checkpoints (if you want explicit)
CREATE TABLE IF NOT EXISTS dev.kafka_checkpoints (
  topic String, 
  partition_id Int32, 
  last_offset Int64, 
  updated_at DateTime64(3) DEFAULT now64(3)
) ENGINE=ReplacingMergeTree ORDER BY (topic, partition_id);
