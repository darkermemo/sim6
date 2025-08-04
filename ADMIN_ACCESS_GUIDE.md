# SIEM Admin Access Guide

This guide explains how to start the SIEM system with admin access enabled, allowing you to access all pages without login during development.

## Quick Start

### Option 1: Full System with Admin Access (Recommended)
```bash
./run_with_admin.sh
```

This will:
- Start all SIEM components (ClickHouse, API, UI, Search)
- Configure dev-auth token for admin access
- Provide admin access utilities
- Show you all the URLs and tools available

### Option 2: Manual Startup
```bash
./start_siem_with_admin_access.sh
```

## Admin Access Tools

After starting the system, you can use these tools:

### Test Admin Access
```bash
./admin_access.sh dashboard    # Test dashboard access
./admin_access.sh search       # Interactive search
./admin_access.sh health       # Health check
./admin_access.sh logs         # View logs
./admin_access.sh alerts       # View alerts
```

### Manual API Calls
```bash
# Using the admin token directly
curl -H "X-Admin-Token: $DEV_ADMIN_TOKEN" http://localhost:8080/api/dashboard
```

## URLs

- **UI**: http://localhost:3001 (with admin access)
- **API**: http://localhost:8080
- **Search API**: http://localhost:8084
- **ClickHouse**: http://localhost:8123

## Environment Variables

The system uses these key environment variables:

- `DEV_ADMIN_TOKEN`: Admin token for bypassing authentication
- `ENVIRONMENT`: Set to "development" for dev-auth
- `RUST_LOG`: Logging level

## Security Notes

⚠️ **Important**: The dev-auth feature is for development only!

- Never use in production
- The admin token provides full system access
- Only enable when `ENVIRONMENT=development`

## Troubleshooting

### Token Not Working
1. Check `.env` file has `DEV_ADMIN_TOKEN` set
2. Ensure `ENVIRONMENT=development`
3. Restart services with `./run_with_admin.sh`

### Services Not Starting
1. Check if ports are already in use
2. Ensure ClickHouse is running
3. Check logs in the terminal output

### UI Not Loading
1. Wait for all services to start (can take 30-60 seconds)
2. Check if UI server is running on port 3001
3. Try refreshing the browser

## Development Workflow

1. **Setup**: Run `./dev-setup.sh` (one time)
2. **Start**: Run `./run_with_admin.sh`
3. **Develop**: Access UI at http://localhost:3001
4. **Test**: Use `./admin_access.sh` tools
5. **Stop**: Ctrl+C in the terminal

## Files Created

- `start_siem_with_admin_access.sh`: Main startup script
- `admin_access.sh`: Admin utility script
- `run_with_admin.sh`: Quick start wrapper
- `ADMIN_ACCESS_GUIDE.md`: This guide

For more technical details, see `DEV_AUTH_SETUP.md`.