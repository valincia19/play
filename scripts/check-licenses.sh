#!/bin/bash
# check-licenses.sh - Verify license compliance
# Usage: ./scripts/check-licenses.sh [frontend|backend|all]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📜 Vercelplay License Compliance Check${NC}"
echo "======================================"

# Allowed licenses (MIT-compatible)
ALLOWED_LICENSES="MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD"

# Function to check licenses
check_licenses() {
    local TARGET=$1
    local DIR=$2

    echo -e "\n${BLUE}🔍 Checking $TARGET licenses...${NC}"

    cd "$DIR"

    # Install license-checker if not present
    if ! command -v license-checker &> /dev/null; then
        echo -e "${YELLOW}📦 Installing license-checker...${NC}"
        npm install -g license-checker
    fi

    # Check licenses
    echo -e "${YELLOW}🔍 Scanning dependencies...${NC}"
    license-checker --production --json > "../$TARGET-licenses.json" 2>/dev/null || true

    # Analyze results
    if [ -f "../$TARGET-licenses.json" ]; then
        echo -e "${GREEN}✅ License scan completed for $TARGET${NC}"

        # Check for non-allowed licenses
        echo -e "${YELLOW}📊 License Summary for $TARGET:${NC}"
        license-checker --production --onlyAllow "$ALLOWED_LICENSES" 2>&1 | head -20 || true

        # Generate detailed report
        echo -e "\n${BLUE}📄 Detailed License Report:${NC}"
        node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('../$TARGET-licenses.json', 'utf8'));
        const licenses = {};

        for (const [name, info] of Object.entries(data)) {
            const lic = info.licenses || 'Unknown';
            if (!licenses[lic]) licenses[lic] = [];
            licenses[lic].push(name);
        }

        console.log('\\nLicense Distribution:');
        for (const [license, packages] of Object.entries(licenses)) {
            console.log(\`  \${license}: \${packages.length} packages\`);
        }
        " 2>/dev/null || echo "Could not generate detailed report"
    else
        echo -e "${RED}❌ License check failed for $TARGET${NC}"
    fi

    cd - > /dev/null
}

# Main script logic
TARGET=${1:-all}

case $TARGET in
    frontend)
        check_licenses "frontend" "frontend"
        ;;
    backend)
        check_licenses "backend" "backend"
        ;;
    all)
        check_licenses "frontend" "frontend"
        check_licenses "backend" "backend"

        echo -e "\n${GREEN}✅ License compliance check completed${NC}"
        echo -e "${YELLOW}📝 Review the generated JSON files for detailed analysis${NC}"
        ;;
    *)
        echo -e "${RED}❌ Invalid target. Use: frontend, backend, or all${NC}"
        exit 1
        ;;
esac