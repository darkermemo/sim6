#!/bin/bash

# SIEM System Startup Script with Admin Access
# Starts all SIEM components with dev-auth token for admin access without login
# This script provides a complete development environment with authentication bypass

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_admin() {
    echo -e "${PURPLE}[ADMIN]${NC} $1"
}

# Load environment variables from .env
if [ -f ".env" ]; then
    log_info "Loading environment variables from .env"
    set -a  # automatically export all variables
    source .env
    set +a  # stop automatically exporting
else
    log_error ".env file not found. Please create it based on .env.example"
    exit 1
fi

# Set defaults if not provided
PROJECT_ROOT=${PROJECT_ROOT:-$(pwd)}
LOGS_DIR=${LOGS_DIR:-"${PROJECT_ROOT}/logs"}
API_URL=${API_URL:-"http://localhost:8080"}
CLICKHOUSE_URL=${CLICKHOUSE_URL:-"http://localhost:8123"}
UI_PORT=${VITE_PORT:-3001}
SEARCH_API_URL="http://localhost:8084"

# Verify DEV_ADMIN_TOKEN is set
if [ -z "$DEV_ADMIN_TOKEN" ]; then
    log_error "DEV_ADMIN_TOKEN not set in .env file"
    log_error "This is required for admin access without login"
    exit 1
fi

LOG_FILE="${LOGS_DIR}/startup_admin.log"

# Function to log messages with timestamp
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name="$1"
    local check_command="$2"
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if eval "$check_command" > /dev/null 2>&1; then
            log_success "$service_name is ready!"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts: $service_name not ready yet..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "$service_name failed to start after $max_attempts attempts"
    return 1
}

# Function to kill existing processes
kill_existing_processes() {
    log_info "Stopping any existing SIEM processes..."
    
    # Kill existing Rust processes
    pkill -f "siem_api" 2>/dev/null || true
    pkill -f "siem_clickhouse_search" 2>/dev/null || true
    pkill -f "siem_ingestor" 2>/dev/null || true
    pkill -f "siem_consumer" 2>/dev/null || true
    pkill -f "siem_rule_engine" 2>/dev/null || true
    pkill -f "siem_stream_processor" 2>/dev/null || true
    pkill -f "siem_parser" 2>/dev/null || true
    
    # Kill existing UI processes
    pkill -f "npm.*dev" 2>/dev/null || true
    pkill -f "node.*siem_ui_api_server" 2>/dev/null || true
    
    sleep 3
    log_success "Existing processes stopped"
}

# Function to test admin access
test_admin_access() {
    log_admin "Testing admin access with dev token..."
    
    # Test search API with dev token
    local response=$(curl -s -w "%{http_code}" -H "X-Admin-Token: $DEV_ADMIN_TOKEN" "$SEARCH_API_URL/api/v1/dashboard" -o /dev/null)
    
    if [ "$response" = "200" ]; then
        log_success "✅ Admin access confirmed - Dashboard API accessible"
        return 0
    else
        log_warn "⚠️  Admin access test returned HTTP $response"
        log_warn "This might be normal if the API is still starting up"
        log_warn "You can test admin access manually once all services are fully loaded"
        return 0
    fi
}

# Function to display admin access information
show_admin_access_info() {
    echo
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo -e "${PURPLE}🔑 ADMIN ACCESS CONFIGURATION${NC}"
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo
    echo -e "${GREEN}✅ Development Authentication Enabled${NC}"
    echo -e "${GREEN}✅ Admin Token Configured${NC}"
    echo
    echo "📋 Admin Access Details:"
    echo "   • Token: ${DEV_ADMIN_TOKEN:0:20}..."
    echo "   • Header: X-Admin-Token"
    echo "   • Access Level: Full Admin (dev-auth)"
    echo
    echo "🌐 API Endpoints with Admin Access:"
    echo "   • Dashboard: $SEARCH_API_URL/api/v1/dashboard"
    echo "   • Events: $SEARCH_API_URL/api/v1/events"
    echo "   • Search: $SEARCH_API_URL/api/v1/events/search"
    echo "   • Schema: $SEARCH_API_URL/schema"
    echo
    echo "🔧 cURL Examples:"
    echo "   # Get dashboard data"
    echo "   curl -H 'X-Admin-Token: $DEV_ADMIN_TOKEN' '$SEARCH_API_URL/api/v1/dashboard'"
    echo
    echo "   # Search events"
    echo "   curl -H 'X-Admin-Token: $DEV_ADMIN_TOKEN' -H 'Content-Type: application/json' \\"
    echo "        -d '{\"query\": \"*\", \"limit\": 10}' '$SEARCH_API_URL/api/v1/events/search'"
    echo
    echo "🖥️  Browser Access:"
    echo "   • UI: http://localhost:$UI_PORT (no login required in dev mode)"
    echo "   • API Docs: $API_URL/docs (if available)"
    echo
    echo "⚠️  Security Notice:"
    echo "   This configuration is for DEVELOPMENT ONLY!"
    echo "   Never use dev-auth in production environments."
    echo
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo
}

# Function to create admin access script
create_admin_script() {
    local script_path="${PROJECT_ROOT}/admin_access.sh"
    
    cat > "$script_path" << 'EOF'
#!/bin/bash

# Quick Admin Access Script
# Provides easy access to SIEM APIs with admin token

# Load environment
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

SEARCH_API_URL="http://localhost:8084"
API_URL="http://localhost:8080"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}🔑 SIEM Admin Access Utility${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo

if [ -z "$DEV_ADMIN_TOKEN" ]; then
    echo "❌ DEV_ADMIN_TOKEN not found in environment"
    exit 1
fi

echo -e "${GREEN}Available Commands:${NC}"
echo "  1. dashboard    - Get dashboard data"
echo "  2. events       - List recent events"
echo "  3. search       - Search events (interactive)"
echo "  4. health       - Check API health"
echo "  5. token        - Show current admin token"
echo

case "$1" in
    "dashboard")
        echo -e "${BLUE}Fetching dashboard data...${NC}"
        curl -s -H "X-Admin-Token: $DEV_ADMIN_TOKEN" "$SEARCH_API_URL/api/v1/dashboard" | jq .
        ;;
    "events")
        echo -e "${BLUE}Fetching recent events...${NC}"
        curl -s -H "X-Admin-Token: $DEV_ADMIN_TOKEN" "$SEARCH_API_URL/api/v1/events?limit=10" | jq .
        ;;
    "search")
        echo -e "${BLUE}Enter search query (or * for all):${NC}"
        read -r query
        echo -e "${BLUE}Searching for: $query${NC}"
        curl -s -H "X-Admin-Token: $DEV_ADMIN_TOKEN" -H "Content-Type: application/json" \
             -d "{\"query\": \"$query\", \"limit\": 10}" "$SEARCH_API_URL/api/v1/events/search" | jq .
        ;;
    "health")
        echo -e "${BLUE}Checking API health...${NC}"
        echo "Search API:"
        curl -s "$SEARCH_API_URL/health" | jq .
        echo "Main API:"
        curl -s "$API_URL/api/v1/health" | jq .
        ;;
    "token")
        echo -e "${BLUE}Current admin token:${NC}"
        echo "$DEV_ADMIN_TOKEN"
        echo
        echo -e "${BLUE}Usage in requests:${NC}"
        echo "curl -H 'X-Admin-Token: $DEV_ADMIN_TOKEN' <URL>"
        ;;
    *)
        echo "Usage: $0 {dashboard|events|search|health|token}"
        echo
        echo "Examples:"
        echo "  $0 dashboard     # Get dashboard data"
        echo "  $0 events        # List recent events"
        echo "  $0 search        # Interactive search"
        echo "  $0 health        # Check API status"
        echo "  $0 token         # Show admin token"
        ;;
esac
EOF

    chmod +x "$script_path"
    log_success "Created admin access utility: $script_path"
}

# Create logs directory
mkdir -p "${LOGS_DIR}"

echo
echo "🚀 Starting SIEM System with Admin Access"
echo "═══════════════════════════════════════════════════════════════════════════════"
log_message "Starting SIEM system with admin access..."

# Stop existing processes first
kill_existing_processes

# 1. Check if ClickHouse is running
log_info "Checking ClickHouse status..."
if ! pgrep -f "clickhouse server" > /dev/null; then
    log_warn "ClickHouse is not running. Starting it..."
    if command -v brew >/dev/null 2>&1; then
        brew services start clickhouse
        sleep 5
    else
        log_error "ClickHouse is not running and brew is not available to start it."
        log_error "Please start ClickHouse manually."
        exit 1
    fi
else
    log_success "ClickHouse is running"
fi

# Wait for ClickHouse to be ready
wait_for_service "ClickHouse" "curl -s '${CLICKHOUSE_URL}/' --data 'SELECT 1'"

# 2. Start SIEM ClickHouse Search with dev-auth
log_info "Starting SIEM ClickHouse Search with dev-auth..."
cd "${PROJECT_ROOT}/siem_clickhouse_search"
nohup cargo run --features dev-auth > "${LOGS_DIR}/siem_clickhouse_search.log" 2>&1 &
sleep 8

# Wait for search service to be ready
wait_for_service "SIEM ClickHouse Search" "curl -s '$SEARCH_API_URL/health'"

# 3. Start SIEM API
log_info "Starting SIEM API..."
cd "${PROJECT_ROOT}/siem_api"
nohup cargo run --bin siem_api > "${LOGS_DIR}/siem_api.log" 2>&1 &
sleep 5

# Wait for SIEM API to be ready
wait_for_service "SIEM API" "curl -s '${API_URL}/api/v1/health'"

# 4. Start UI API Server
log_info "Starting UI API Server..."
cd "${PROJECT_ROOT}"
nohup node siem_ui_api_server.js > "${LOGS_DIR}/siem_ui_api_server.log" 2>&1 &
sleep 3

# 5. Start SIEM UI
log_info "Starting SIEM UI..."
cd "${PROJECT_ROOT}/siem_ui"

# Check if node_modules exists, if not run npm install
if [ ! -d "node_modules" ]; then
    log_info "Installing UI dependencies..."
    npm install
fi

nohup npm run dev > "${LOGS_DIR}/siem_ui.log" 2>&1 &
sleep 10

# Wait for SIEM UI to be ready
wait_for_service "SIEM UI" "curl -s 'http://localhost:${UI_PORT}/'"

# Test admin access (non-fatal)
test_admin_access || {
    log_warn "Admin access test failed, but continuing startup..."
    log_warn "Services may still be initializing. Try testing again in a few moments."
}

# Create admin access utility script
create_admin_script

# Show admin access information
show_admin_access_info

log_success "SIEM system startup with admin access complete!"

echo "📋 Quick Commands:"
echo "   • Test admin access: ./admin_access.sh dashboard"
echo "   • View logs: tail -f ${LOGS_DIR}/*.log"
echo "   • Stop system: ./stop_siem_system.sh"
echo "   • Monitor system: ./monitor_and_restart.sh &"
echo

# Show running processes
log_info "Running SIEM processes:"
ps aux | grep -E "(siem_|npm.*dev|node.*siem_ui_api_server)" | grep -v grep | while read line; do
    log_message "  $line"
done

echo
log_success "🎉 SIEM System is ready with full admin access!"
echo