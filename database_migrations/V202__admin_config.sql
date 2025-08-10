-- Admin config key/value store (JSON blobs in `v`)
CREATE TABLE IF NOT EXISTS dev.admin_config
(
  k String,
  v String
) ENGINE = TinyLog;


