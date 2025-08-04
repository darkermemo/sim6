#!/bin/bash

# Quick SIEM Startup with Admin Access
# This is a simple wrapper for the full admin access startup script

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}🚀 SIEM Quick Start with Admin Access${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo

# Check if we're in the right directory
if [ ! -f "start_siem_with_admin_access.sh" ]; then
    echo "❌ start_siem_with_admin_access.sh not found in current directory"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found"
    echo "Please create .env file based on .env.example"
    exit 1
fi

echo -e "${BLUE}Starting SIEM system with admin access...${NC}"
echo

# Run the full startup script
./start_siem_with_admin_access.sh

echo
echo -e "${GREEN}✅ SIEM system started successfully!${NC}"
echo
echo "🔗 Quick Links:"
echo "   • UI: http://localhost:3001"
echo "   • API: http://localhost:8080"
echo "   • Search API: http://localhost:8084"
echo
echo "🛠️  Admin Tools:"
echo "   • Test admin access: ./admin_access.sh dashboard"
echo "   • Interactive search: ./admin_access.sh search"
echo "   • Check health: ./admin_access.sh health"
echo
echo "📚 Documentation:"
echo "   • Dev Auth Setup: cat DEV_AUTH_SETUP.md"
echo "   • Environment Config: cat .env"
echo
echo -e "${PURPLE}Happy SIEM development! 🎉${NC}"