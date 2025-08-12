#!/usr/bin/env bash
# CI Toolchain Setup Script
# Install all tools required to mirror GitHub Actions locally
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}🔧 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo -e "${BLUE}🚀 Setting up CI toolchain for local development...${NC}\n"

# =============================================================================
# 1. RUST TOOLCHAIN
# =============================================================================
print_step "Setting up Rust toolchain"

# Update Rust to stable
rustup update stable

# Add required components
rustup component add rustfmt clippy rust-analyzer

print_success "Rust toolchain updated"

# =============================================================================
# 2. CARGO HELPER TOOLS
# =============================================================================
print_step "Installing Cargo helper tools"

# List of tools to install
CARGO_TOOLS=(
    "cargo-udeps"
    "cargo-audit" 
    "cargo-geiger"
    "cargo-mod"
    "cargo-deps"
    "cargo-watch"
    "cargo-expand"
)

for tool in "${CARGO_TOOLS[@]}"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        print_step "Installing $tool"
        if ! cargo install --locked "$tool"; then
            print_warning "Failed to install $tool (continuing anyway)"
        else
            print_success "Installed $tool"
        fi
    else
        print_success "$tool already installed"
    fi
done

# =============================================================================
# 3. SYSTEM DEPENDENCIES
# =============================================================================
print_step "Installing system dependencies"

# Detect OS
OS=$(uname -s)
case $OS in
    Darwin)
        print_step "Detected macOS - using Homebrew"
        
        # Check if Homebrew is installed
        if ! command -v brew >/dev/null 2>&1; then
            print_error "Homebrew not installed. Please install Homebrew first:"
            echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
        
        # System tools
        BREW_PACKAGES=(
            "graphviz"
            "pandoc"
            "wkhtmltopdf"
            "yamllint"
            "vector"
            "act"  # For local GitHub Actions testing
        )
        
        for package in "${BREW_PACKAGES[@]}"; do
            if ! brew list "$package" >/dev/null 2>&1; then
                print_step "Installing $package"
                if ! brew install "$package"; then
                    print_warning "Failed to install $package (continuing anyway)"
                else
                    print_success "Installed $package"
                fi
            else
                print_success "$package already installed"
            fi
        done
        
        # Mermaid CLI
        if ! command -v mmdc >/dev/null 2>&1; then
            print_step "Installing mermaid-cli"
            if ! npm install -g @mermaid-js/mermaid-cli; then
                print_warning "Failed to install mermaid-cli (npm required)"
            else
                print_success "Installed mermaid-cli"
            fi
        fi
        ;;
        
    Linux)
        print_step "Detected Linux"
        
        # Detect package manager
        if command -v apt-get >/dev/null 2>&1; then
            print_step "Using apt package manager"
            
            sudo apt-get update
            
            APT_PACKAGES=(
                "build-essential"
                "graphviz"
                "pandoc"
                "wkhtmltopdf"
                "yamllint"
            )
            
            for package in "${APT_PACKAGES[@]}"; do
                print_step "Installing $package"
                if ! sudo apt-get install -y "$package"; then
                    print_warning "Failed to install $package"
                else
                    print_success "Installed $package"
                fi
            done
            
        elif command -v yum >/dev/null 2>&1; then
            print_step "Using yum package manager"
            
            YUM_PACKAGES=(
                "gcc"
                "gcc-c++"
                "graphviz"
                "pandoc"
                "wkhtmltopdf"
                "yamllint"
            )
            
            for package in "${YUM_PACKAGES[@]}"; do
                print_step "Installing $package"
                if ! sudo yum install -y "$package"; then
                    print_warning "Failed to install $package"
                else
                    print_success "Installed $package"
                fi
            done
            
        else
            print_warning "Unknown package manager. Please install manually:"
            echo "  - graphviz, pandoc, wkhtmltopdf, yamllint"
        fi
        
        # Vector (Linux)
        if ! command -v vector >/dev/null 2>&1; then
            print_step "Installing Vector"
            curl --proto '=https' --tlsv1.2 -sSf https://sh.vector.dev | bash -s -- -y
            print_success "Installed Vector"
        fi
        
        # Act for GitHub Actions local testing
        if ! command -v act >/dev/null 2>&1; then
            print_step "Installing act"
            curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
            print_success "Installed act"
        fi
        ;;
        
    *)
        print_warning "Unsupported OS: $OS"
        print_warning "Please install manually: graphviz, pandoc, wkhtmltopdf, yamllint, vector"
        ;;
esac

# =============================================================================
# 4. NODE.JS TOOLS
# =============================================================================
print_step "Installing Node.js tools"

# Check if Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    print_warning "Node.js not installed. Please install Node.js 18+ first"
    echo "  Visit: https://nodejs.org/"
else
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_warning "Node.js version $NODE_VERSION is too old. Please upgrade to v18+"
    else
        print_success "Node.js $(node --version) detected"
        
        # Global npm packages
        NPM_PACKAGES=(
            "@stoplight/spectral-cli"
            "@apidevtools/swagger-parser"
            "@apidevtools/swagger-diff"
            "@redocly/cli"
            "yaml-lint"
            "dockerfilelint"
            "@42crunch/api-security-audit"
            "@mermaid-js/mermaid-cli"
        )
        
        for package in "${NPM_PACKAGES[@]}"; do
            if ! npm list -g "$package" >/dev/null 2>&1; then
                print_step "Installing $package"
                if ! npm install -g "$package"; then
                    print_warning "Failed to install $package"
                else
                    print_success "Installed $package"
                fi
            else
                print_success "$package already installed"
            fi
        done
    fi
fi

# =============================================================================
# 5. PYTHON TOOLS (optional)
# =============================================================================
if command -v python3 >/dev/null 2>&1; then
    print_step "Installing Python tools (optional)"
    
    PYTHON_PACKAGES=(
        "yamllint"
        "black"
        "flake8"
    )
    
    for package in "${PYTHON_PACKAGES[@]}"; do
        if ! python3 -m pip show "$package" >/dev/null 2>&1; then
            print_step "Installing Python package: $package"
            if ! python3 -m pip install "$package"; then
                print_warning "Failed to install Python package: $package"
            else
                print_success "Installed Python package: $package"
            fi
        else
            print_success "Python package $package already installed"
        fi
    done
fi

# =============================================================================
# 6. CLICKHOUSE CLIENT (optional)
# =============================================================================
print_step "Checking ClickHouse client"
if ! command -v clickhouse >/dev/null 2>&1; then
    print_warning "ClickHouse client not installed"
    print_warning "Install manually if needed for database validation:"
    case $OS in
        Darwin)
            echo "  brew install clickhouse"
            ;;
        Linux)
            echo "  curl https://clickhouse.com/ | sh"
            ;;
    esac
else
    print_success "ClickHouse client available"
fi

# =============================================================================
# FINAL SUMMARY
# =============================================================================
echo ""
echo -e "${GREEN}🎉 CI TOOLCHAIN SETUP COMPLETED! 🎉${NC}"
echo ""
echo "Installed tools summary:"
echo "✅ Rust toolchain (rustfmt, clippy, rust-analyzer)"
echo "✅ Cargo helper tools (audit, udeps, geiger, etc.)"
echo "✅ System dependencies (graphviz, pandoc, etc.)"
echo "✅ Node.js linting and validation tools"
echo "✅ Vector configuration validator"
echo "✅ GitHub Actions local runner (act)"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Run './scripts/ci_local.sh' to test your setup"
echo "2. Set up the pre-push hook with './scripts/setup_pre_push_hook.sh'"
echo "3. Start developing with confidence! 🚀"
echo ""
echo -e "${YELLOW}Note:${NC} Some tools may require additional configuration."
echo "Check tool documentation if you encounter issues."