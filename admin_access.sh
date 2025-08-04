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
