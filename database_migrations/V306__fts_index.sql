-- V306__fts_index.sql
-- Add token Bloom filter index for fast free-text search

-- Token Bloom filter index (works well with LIKE/positionCaseInsensitive)
ALTER TABLE dev.events
  ADD INDEX IF NOT EXISTS idx_msg_token tokenbf_v1(message) GRANULARITY 1;
