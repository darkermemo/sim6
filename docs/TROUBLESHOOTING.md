# SIEM System Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the SIEM system.

## Quick Diagnostics

### 1. Run System Health Check
```bash
# From project root
./system_health_check.sh
```

### 2. Check Service Status
```bash
make status
```

### 3. View Recent Logs
```bash
make logs
```

### 4. Restart Development Environment
```bash
make dev-reset
bin/dev-up
```

## Common Issues

### Startup Issues

#### Issue: `bin/dev-up` fails immediately

**Symptoms:**
- Script exits with error before starting services
- Configuration validation fails
- Dependency check fails

**Diagnosis:**
```bash
# Check configuration
./scripts/verify-config.sh

# Check dependencies
./scripts/verify-deps.sh

# Check Rust projects
./scripts/verify-rust.sh
```

**Solutions:**

1. **Missing Environment File:**
   ```bash
   # Copy and customize environment file
   cp config/dev.env .env
   # Edit .env with your specific settings
   ```

2. **Missing Dependencies:**
   ```bash
   # Install Rust
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   
   # Install Node.js (using nvm)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install node
   
   # Install ClickHouse client (macOS)
   brew install clickhouse
   ```

3. **Port Conflicts:**
   ```bash
   # Check what's using the ports
   lsof -i :8080  # SIEM API
   lsof -i :8081  # ClickHouse Ingestor
   lsof -i :8082  # Unified Pipeline
   lsof -i :3004  # SIEM UI
   
   # Kill conflicting processes
   sudo kill -9 <PID>
   ```

#### Issue: Services start but fail health checks

**Symptoms:**
- Services appear to start but `/health` endpoints fail
- Integration verification fails
- Services crash shortly after startup

**Diagnosis:**
```bash
# Check service logs
tail -f logs/siem_api.log
tail -f logs/siem_clickhouse_ingestion.log
tail -f logs/siem_unified_pipeline.log
tail -f logs/siem_ui.log

# Check if services are listening
netstat -an | grep LISTEN | grep -E ':(8080|8081|8082|3004)'
```

**Solutions:**

1. **Database Connection Issues:**
   ```bash
   # Test ClickHouse connection
   clickhouse-client --host localhost --port 8123 --query "SELECT 1"
   
   # Test PostgreSQL connection
   psql -h localhost -p 5432 -U siem_user -d siem_db -c "SELECT 1;"
   
   # Test Redis connection
   redis-cli ping
   ```

2. **Configuration Issues:**
   ```bash
   # Verify environment variables are loaded
   env | grep SIEM
   env | grep CLICKHOUSE
   env | grep DATABASE
   ```

3. **Permission Issues:**
   ```bash
   # Check log directory permissions
   ls -la logs/
   
   # Fix permissions if needed
   chmod 755 logs/
   chmod 644 logs/*.log
   ```

### Database Issues

#### Issue: ClickHouse connection failures

**Symptoms:**
- "Connection refused" errors
- "Database does not exist" errors
- Timeout errors

**Diagnosis:**
```bash
# Check if ClickHouse is running
ps aux | grep clickhouse

# Check ClickHouse logs
tail -f /var/log/clickhouse-server/clickhouse-server.log

# Test connection
clickhouse-client --host $CLICKHOUSE_HOST --port $CLICKHOUSE_PORT --query "SELECT version()"
```

**Solutions:**

1. **Start ClickHouse:**
   ```bash
   # macOS with Homebrew
   brew services start clickhouse
   
   # Linux with systemd
   sudo systemctl start clickhouse-server
   
   # Docker
   docker run -d --name clickhouse-server --ulimit nofile=262144:262144 -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server
   ```

2. **Create Database:**
   ```bash
   # Connect and create database
   clickhouse-client --query "CREATE DATABASE IF NOT EXISTS dev"
   
   # Verify database exists
   clickhouse-client --query "SHOW DATABASES"
   ```

3. **Check Configuration:**
   ```bash
   # Verify ClickHouse config
   cat /etc/clickhouse-server/config.xml | grep -A5 -B5 "<http_port>"
   ```

#### Issue: PostgreSQL connection failures

**Symptoms:**
- "Connection refused" errors
- Authentication failures
- Database does not exist

**Diagnosis:**
```bash
# Check if PostgreSQL is running
ps aux | grep postgres

# Test connection
psql -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -d $DATABASE_NAME -c "SELECT version();"
```

**Solutions:**

1. **Start PostgreSQL:**
   ```bash
   # macOS with Homebrew
   brew services start postgresql
   
   # Linux with systemd
   sudo systemctl start postgresql
   
   # Docker
   docker run -d --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:13
   ```

2. **Create Database and User:**
   ```bash
   # Connect as superuser
   psql -U postgres
   
   # Create user and database
   CREATE USER siem_user WITH PASSWORD 'siem_password';
   CREATE DATABASE siem_db OWNER siem_user;
   GRANT ALL PRIVILEGES ON DATABASE siem_db TO siem_user;
   ```

### Rust Compilation Issues

#### Issue: Cargo build failures

**Symptoms:**
- Compilation errors
- Dependency resolution failures
- Clippy warnings/errors

**Diagnosis:**
```bash
# Check Rust version
rustc --version
cargo --version

# Update Rust
rustup update

# Clean and rebuild
cargo clean
cargo build
```

**Solutions:**

1. **Dependency Issues:**
   ```bash
   # Update dependencies
   cargo update
   
   # Check for outdated dependencies
   cargo outdated
   
   # Audit for security issues
   cargo audit
   ```

2. **Clippy Issues:**
   ```bash
   # Run clippy with fixes
   cargo clippy --fix --allow-dirty
   
   # Format code
   cargo fmt
   ```

3. **Version Conflicts:**
   ```bash
   # Check dependency tree
   cargo tree
   
   # Resolve conflicts in Cargo.toml
   # Add specific versions for conflicting dependencies
   ```

### Frontend Issues

#### Issue: SIEM UI fails to start

**Symptoms:**
- npm/yarn errors
- Port conflicts
- Build failures

**Diagnosis:**
```bash
# Check Node.js version
node --version
npm --version

# Check for port conflicts
lsof -i :3004

# Check package.json
cat siem_ui/package.json
```

**Solutions:**

1. **Install Dependencies:**
   ```bash
   cd siem_ui
   npm install
   # or
   yarn install
   ```

2. **Clear Cache:**
   ```bash
   cd siem_ui
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Version Issues:**
   ```bash
   # Use correct Node.js version
   nvm use 18
   
   # Update npm
   npm install -g npm@latest
   ```

### Network and Connectivity Issues

#### Issue: Services can't communicate

**Symptoms:**
- API calls fail between services
- Health checks timeout
- Frontend can't reach backend

**Diagnosis:**
```bash
# Test service endpoints
curl -f http://localhost:8080/health
curl -f http://localhost:8081/health
curl -f http://localhost:8082/health
curl -f http://localhost:3004

# Check network connectivity
netstat -an | grep LISTEN
ss -tlnp | grep -E ':(8080|8081|8082|3004)'
```

**Solutions:**

1. **Firewall Issues:**
   ```bash
   # macOS - check firewall
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
   
   # Linux - check iptables
   sudo iptables -L
   ```

2. **Binding Issues:**
   ```bash
   # Check if services are binding to correct interfaces
   # Update .env file
   SIEM__SERVER__BIND_ADDRESS="0.0.0.0:8080"
   ```

3. **DNS Issues:**
   ```bash
   # Test localhost resolution
   nslookup localhost
   ping localhost
   ```

### Performance Issues

#### Issue: Slow response times

**Symptoms:**
- API responses take too long
- UI is unresponsive
- Database queries are slow

**Diagnosis:**
```bash
# Check system resources
top
htop
df -h
free -m

# Check database performance
clickhouse-client --query "SELECT * FROM system.processes"

# Check API logs for slow requests
grep -E "took [0-9]{3,}ms" logs/siem_api.log
```

**Solutions:**

1. **Resource Constraints:**
   ```bash
   # Increase memory limits
   export RUST_LOG=info  # Reduce log verbosity
   
   # Close unnecessary applications
   # Add more RAM if needed
   ```

2. **Database Optimization:**
   ```bash
   # Optimize ClickHouse queries
   clickhouse-client --query "OPTIMIZE TABLE dev.events"
   
   # Check query performance
   clickhouse-client --query "SELECT query, elapsed FROM system.query_log ORDER BY elapsed DESC LIMIT 10"
   ```

3. **Code Optimization:**
   ```bash
   # Profile Rust applications
   cargo build --release
   
   # Use release builds for performance testing
   RUST_LOG=warn cargo run --release
   ```

## Log Analysis

### Log Locations

```
logs/
├── siem_api.log              # Main API server logs
├── siem_clickhouse_ingestion.log  # ClickHouse ingestor logs
├── siem_unified_pipeline.log # Pipeline processing logs
├── siem_ui.log              # Frontend build/serve logs
├── system_health.log        # Health check results
└── integration_report.log   # Integration test results
```

### Common Log Patterns

#### Error Patterns
```bash
# Database connection errors
grep -i "connection" logs/*.log | grep -i error

# Authentication errors
grep -i "auth" logs/*.log | grep -i "error\|fail"

# Panic/crash patterns
grep -i "panic\|crash\|fatal" logs/*.log

# Performance issues
grep -E "slow|timeout|took [0-9]{3,}ms" logs/*.log
```

#### Success Patterns
```bash
# Successful startups
grep -i "server started\|listening on" logs/*.log

# Successful health checks
grep -i "health check.*ok" logs/*.log

# Successful requests
grep -E "200|201|204" logs/siem_api.log
```

### Log Analysis Commands

```bash
# Real-time log monitoring
tail -f logs/*.log

# Error summary
grep -i error logs/*.log | cut -d: -f1 | sort | uniq -c

# Request rate analysis
grep "$(date +'%Y-%m-%d %H:%M')" logs/siem_api.log | wc -l

# Top error messages
grep -i error logs/*.log | cut -d' ' -f4- | sort | uniq -c | sort -nr | head -10
```

## Environment-Specific Issues

### macOS Issues

1. **Homebrew Permission Issues:**
   ```bash
   # Fix Homebrew permissions
   sudo chown -R $(whoami) $(brew --prefix)/*
   ```

2. **Xcode Command Line Tools:**
   ```bash
   # Install if missing
   xcode-select --install
   ```

3. **File Descriptor Limits:**
   ```bash
   # Check limits
   ulimit -n
   
   # Increase if needed
   ulimit -n 4096
   ```

### Linux Issues

1. **SystemD Service Issues:**
   ```bash
   # Check service status
   systemctl status clickhouse-server
   systemctl status postgresql
   
   # View service logs
   journalctl -u clickhouse-server -f
   ```

2. **Permission Issues:**
   ```bash
   # Check SELinux (if enabled)
   sestatus
   
   # Check AppArmor (if enabled)
   sudo aa-status
   ```

### Docker Issues

1. **Container Health:**
   ```bash
   # Check running containers
   docker ps
   
   # Check container logs
   docker logs clickhouse-server
   docker logs postgres
   
   # Restart containers
   docker restart clickhouse-server
   ```

2. **Network Issues:**
   ```bash
   # Check Docker networks
   docker network ls
   
   # Inspect network
   docker network inspect bridge
   ```

## Advanced Debugging

### Rust Debugging

1. **Enable Debug Logging:**
   ```bash
   export RUST_LOG=debug
   cargo run
   ```

2. **Use Debugger:**
   ```bash
   # Install rust-gdb
   rustup component add rust-src
   
   # Debug with gdb
   rust-gdb target/debug/siem_api
   ```

3. **Memory Debugging:**
   ```bash
   # Use valgrind (Linux)
   valgrind --tool=memcheck target/debug/siem_api
   
   # Use AddressSanitizer
   RUSTFLAGS="-Z sanitizer=address" cargo run
   ```

### Database Debugging

1. **ClickHouse Query Analysis:**
   ```sql
   -- Enable query logging
   SET log_queries = 1;
   
   -- Check slow queries
   SELECT query, elapsed, memory_usage 
   FROM system.query_log 
   WHERE elapsed > 1000 
   ORDER BY elapsed DESC 
   LIMIT 10;
   
   -- Check table sizes
   SELECT 
       database,
       table,
       formatReadableSize(sum(bytes)) as size
   FROM system.parts 
   GROUP BY database, table 
   ORDER BY sum(bytes) DESC;
   ```

2. **PostgreSQL Query Analysis:**
   ```sql
   -- Enable slow query logging
   ALTER SYSTEM SET log_min_duration_statement = 1000;
   SELECT pg_reload_conf();
   
   -- Check active queries
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
   FROM pg_stat_activity 
   WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
   ```

### Network Debugging

1. **Packet Capture:**
   ```bash
   # Capture HTTP traffic
   sudo tcpdump -i lo0 -A -s 0 'port 8080'
   
   # Use Wireshark for detailed analysis
   wireshark
   ```

2. **HTTP Debugging:**
   ```bash
   # Verbose curl requests
   curl -v -H "Authorization: Bearer $JWT_TOKEN" http://localhost:8080/api/v1/events
   
   # Use httpie for better formatting
   http GET localhost:8080/api/v1/events Authorization:"Bearer $JWT_TOKEN"
   ```

## Getting Help

### Internal Resources

1. **Documentation:**
   - `README-DEV.md` - Development guide
   - `docs/ARCHITECTURE.md` - System architecture
   - `docs/TROUBLESHOOTING.md` - This guide

2. **Scripts:**
   - `system_health_check.sh` - Comprehensive health check
   - `verify_rust_backend.sh` - Rust-specific verification
   - `scripts/verify-*.sh` - Component-specific checks

3. **Configuration:**
   - `.env.example` - Environment variable reference
   - `config/dev.env` - Development configuration
   - `config/required-vars.txt` - Required variables list

### External Resources

1. **Rust:**
   - [Rust Book](https://doc.rust-lang.org/book/)
   - [Cargo Book](https://doc.rust-lang.org/cargo/)
   - [Rust Error Index](https://doc.rust-lang.org/error-index.html)

2. **ClickHouse:**
   - [ClickHouse Documentation](https://clickhouse.com/docs/)
   - [ClickHouse Troubleshooting](https://clickhouse.com/docs/en/operations/troubleshooting/)

3. **PostgreSQL:**
   - [PostgreSQL Documentation](https://www.postgresql.org/docs/)
   - [PostgreSQL Wiki](https://wiki.postgresql.org/)

### Escalation Process

1. **Self-Service (5-10 minutes):**
   - Run `bin/dev-up` and check output
   - Check this troubleshooting guide
   - Run health checks and verify logs

2. **Team Support (15-30 minutes):**
   - Gather diagnostic information
   - Document steps taken
   - Share logs and error messages

3. **Expert Support (30+ minutes):**
   - Provide full system state
   - Include configuration files
   - Describe expected vs actual behavior

### Diagnostic Information Collection

When seeking help, collect this information:

```bash
#!/bin/bash
# Diagnostic information script

echo "=== System Information ==="
uname -a
date

echo "\n=== Environment ==="
env | grep -E "SIEM|CLICKHOUSE|DATABASE|RUST" | sort

echo "\n=== Service Status ==="
make status

echo "\n=== Recent Logs ==="
tail -20 logs/*.log

echo "\n=== Process Information ==="
ps aux | grep -E "siem|clickhouse|postgres|redis"

echo "\n=== Network Status ==="
netstat -an | grep LISTEN | grep -E ":(8080|8081|8082|3004|8123|5432|6379)"

echo "\n=== Disk Space ==="
df -h

echo "\n=== Memory Usage ==="
free -m 2>/dev/null || vm_stat
```

Save this as `collect-diagnostics.sh` and run it when reporting issues.

---

**Remember:** The SIEM system is designed to fail fast and provide clear error messages. Most issues can be resolved by following the error messages and using the diagnostic tools provided.