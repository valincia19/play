# 🔧 Dependency Management Quick Guide

Quick reference for managing dependencies in the Vercelplay project.

## 📋 Daily Tasks

### Quick Security Check
```bash
# Frontend
cd frontend
npm run audit:security

# Backend
cd backend
npm run audit:security
```

### Update Dependencies
```bash
# Frontend - Safe updates
cd frontend
npm run deps:update

# Backend - Safe updates
cd backend
npm run deps:update
```

## 🚨 Weekly Tasks

### Full Dependency Audit
```bash
# Check both frontend and backend
cd frontend
npm run audit:all

cd ../backend
npm run audit:all
```

### Check for Outdated Packages
```bash
# Frontend
cd frontend
npm outdated

# Backend
cd backend
npm outdated
```

## 🔄 Monthly Tasks

### Major Dependency Updates
```bash
# Update major versions (requires testing)
cd frontend
npm update react react-dom --latest
npm update @types/node --latest
npm update eslint --latest

cd ../backend
npm update @aws-sdk/client-s3 --latest
npm update elysia --latest
npm update bullmq --latest
```

### License Compliance Check
```bash
./scripts/check-licenses.sh all
```

## 🛠️ Troubleshooting

### Security Vulnerabilities Found
```bash
# Auto-fix vulnerabilities
npm audit fix

# Force fix (may break changes)
npm audit fix --force

# Manual update specific package
npm update package-name@latest
```

### Dependency Conflicts
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# For backend with Bun
rm -rf node_modules package-lock.json
bun install
```

### Build Issues After Update
```bash
# Frontend
cd frontend
rm -rf dist
npm run build

# Backend
cd backend
bun run build  # if available
```

## 📊 Monitoring Commands

### Check Package Health
```bash
# View package info
npm view package-name

# Check package versions
npm ls package-name

# Check outdated packages
npm outdated --long
```

### Analyze Bundle Size
```bash
# Frontend bundle analysis
cd frontend
npm run build
npx bundle-wizard dist

# Or use online tool
# Visit: https://bundlephobia.com/package-name
```

## 🔐 Security Best Practices

### Before Installing New Packages
```bash
# Check package security
npm audit package-name

# Check package license
npm view package-name license

# Check package popularity
npm view package-name downloads last-month

# Check package maintainers
npm view package-name maintainers
```

### After Installing New Packages
```bash
# Run security audit
npm audit

# Update package-lock.json
npm install

# Commit changes
git add package.json package-lock.json
git commit -m "deps: add package-name"
```

## 🎯 Priority Update Guidelines

### 🔴 Critical (Update Immediately)
- Packages with known CVEs
- Packages with security advisories
- Packages with critical bug fixes

### 🟠 High Priority (Update Within Week)
- Major version updates (test thoroughly)
- frequently used packages
- Performance improvements

### 🟡 Medium Priority (Update Within Month)
- Development dependencies
- Minor version updates
- Feature additions

### 🟢 Low Priority (Update When Convenient)
- Documentation updates
- Typo fixes
- License updates

## 📱 Team Communication

### Creating Pull Requests for Updates
```bash
# Create branch
git checkout -b deps/update-package-name

# Update dependencies
npm update package-name

# Test changes
npm run build
npm run test
npm run typecheck

# Commit and push
git add package.json package-lock.json
git commit -m "deps: update package-name to version"
git push origin deps/update-package-name

# Create PR
gh pr create --title "chore(deps): update package-name" \
             --body "Updated package-name to latest version. All tests pass."
```

### Dependency Review Checklist
- [ ] Security audit passed
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Build succeeds
- [ ] No breaking changes (or documented)
- [ ] License compatible
- [ ] Bundle size impact acceptable
- [ ] Performance not degraded

## 🚨 Emergency Procedures

### Critical Vulnerability Response
```bash
# 1. Immediate assessment
npm audit --json > audit.json
jq '.vulnerabilities' audit.json

# 2. Emergency patch
npm audit fix --force

# 3. Test critical functionality
npm run test

# 4. Deploy hotfix
# Follow your deployment procedures

# 5. Monitor for issues
# Check logs and error rates
```

### Dependency Breakage Recovery
```bash
# 1. Identify broken package
npm ls

# 2. Rollback to working version
npm install package-name@previous-version

# 3. Clear cache
npm cache clean --force

# 4. Reinstall
rm -rf node_modules package-lock.json
npm install

# 5. Test functionality
npm run test
npm run build
```

## 📚 Resources

### Official Documentation
- [NPM Documentation](https://docs.npmjs.com/)
- [Bun Documentation](https://bun.sh/docs)
- [Node.js Security](https://nodejs.org/en/docs/guides/security/)

### Security Resources
- [NPM Security Advisories](https://github.com/advisories)
- [Node Security Platform](https://nodesecurity.io)
- [Snyk Vulnerability Database](https://snyk.io/test)

### Tools and Utilities
- [Bundlephobia](https://bundlephobia.com) - Bundle size analysis
- [npmgraph](https://npmgraph.js.org) - Dependency visualization
- [Dependabot](https://dependabot.com) - Automated updates

## 🆘 Getting Help

### Internal Support
- Check team documentation
- Ask in team chat
- Create support ticket

### External Resources
- Stack Overflow
- GitHub Issues
- Package documentation

### Escalation Path
1. Try troubleshooting steps
2. Check package documentation
3. Search existing issues
4. Ask team members
5. Create support ticket

---

**Remember:** Regular dependency management is essential for security and stability. Make it part of your regular development workflow!