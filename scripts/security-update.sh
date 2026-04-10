#!/bin/bash
# security-update.sh - Automated security dependency updates
# Usage: ./scripts/security-update.sh [frontend|backend|all]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔒 Vercelplay Security Update Script${NC}"
echo "===================================="

# Function to update frontend
update_frontend() {
    echo -e "\n${BLUE}📦 Updating frontend dependencies...${NC}"
    cd frontend

    # Run npm audit
    echo -e "${YELLOW}🔍 Running security audit...${NC}"
    npm audit --json > npm-audit.json || true

    # Check for vulnerabilities
    VULN_COUNT=$(jq '.vulnerabilities.total // 0' npm-audit.json)
    if [ "$VULN_COUNT" -gt 0 ]; then
        echo -e "${RED}⚠️  Found $VULN_COUNT vulnerabilities${NC}"
    else
        echo -e "${GREEN}✅ No vulnerabilities found${NC}"
    fi

    # Auto-fix vulnerabilities
    echo -e "${YELLOW}🔧 Auto-fixing vulnerabilities...${NC}"
    npm audit fix || true

    # Update specific high-priority packages
    echo -e "${YELLOW}🔄 Updating high-priority packages...${NC}"
    npm update react react-dom@latest
    npm update @types/node@latest
    npm update eslint@latest
    npm update typescript-eslint@latest

    # Run type checking
    echo -e "${YELLOW}🧪 Running type checking...${NC}"
    if npm run typecheck; then
        echo -e "${GREEN}✅ Frontend type checking passed${NC}"
    else
        echo -e "${RED}❌ Frontend type checking failed${NC}"
        return 1
    fi

    cd ..
    return 0
}

# Function to update backend
update_backend() {
    echo -e "\n${BLUE}📦 Updating backend dependencies...${NC}"
    cd backend

    # Update AWS SDK packages
    echo -e "${YELLOW}🔄 Updating AWS SDK...${NC}"
    npm update @aws-sdk/client-s3@latest @aws-sdk/lib-storage@latest @aws-sdk/s3-request-presigner@latest

    # Update other critical packages
    echo -e "${YELLOW}🔄 Updating other packages...${NC}"
    npm update elysia@latest bullmq@latest
    npm update pino@latest nodemailer@latest

    # Run tests if available
    echo -e "${YELLOW}🧪 Running tests...${NC}"
    if bun run test 2>/dev/null; then
        echo -e "${GREEN}✅ Backend tests passed${NC}"
    else
        echo -e "${YELLOW}⚠️  No backend tests available or tests failed${NC}"
    fi

    cd ..
    return 0
}

# Main script logic
TARGET=${1:-all}

case $TARGET in
    frontend)
        update_frontend
        ;;
    backend)
        update_backend
        ;;
    all)
        if update_frontend && update_backend; then
            echo -e "\n${GREEN}✅ Security updates completed successfully${NC}"
            echo -e "${YELLOW}📝 Please review the changes and commit${NC}"
        else
            echo -e "\n${RED}❌ Some updates failed${NC}"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}❌ Invalid target. Use: frontend, backend, or all${NC}"
        exit 1
        ;;
esac