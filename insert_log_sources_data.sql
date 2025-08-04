INSERT INTO dev.log_sources (id, name, type, subtype, parser_id, tenant_id, status) VALUES
('ls-palo-alto-001', 'Palo Alto Firewall Main', 'firewall', 'palo_alto', 'parser-palo-alto-001', 'tenant-A', 'active'),
('ls-windows-dc-001', 'Windows Domain Controller', 'os', 'windows', 'parser-windows-001', 'tenant-A', 'active'),
('ls-crowdstrike-001', 'CrowdStrike EDR', 'edr', 'crowdstrike', 'parser-crowdstrike-001', 'tenant-A', 'active'),
('ls-squid-proxy-001', 'Squid Proxy Server', 'proxy', 'squid', 'parser-squid-001', 'tenant-A', 'active')