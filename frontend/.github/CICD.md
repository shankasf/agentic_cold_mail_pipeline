# CI/CD Pipeline Documentation

This document describes the CI/CD pipeline setup for the Email Marketing Dashboard.

## Overview

The pipeline consists of three main workflows:

1. **CI (Continuous Integration)** - Runs on every push and PR
2. **CD (Continuous Deployment)** - Deploys to staging/production
3. **PR (Pull Request)** - Additional checks for pull requests

## Workflows

### CI Workflow (`.github/workflows/ci.yml`)

Triggered on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

Jobs:
| Job | Description |
|-----|-------------|
| `lint` | Runs ESLint and TypeScript type checking |
| `test` | Runs unit tests with Vitest and generates coverage |
| `build` | Builds the Next.js application |
| `security` | Runs npm audit for vulnerabilities |
| `prisma` | Validates Prisma schema |

### CD Workflow (`.github/workflows/cd.yml`)

Triggered on:
- Push to `main` branch (automatic staging deployment)
- Manual workflow dispatch (for production deployment)

Jobs:
| Job | Description |
|-----|-------------|
| `ci` | Reuses CI workflow |
| `docker` | Builds and pushes Docker image to GHCR |
| `deploy-staging` | Deploys to staging environment |
| `deploy-production` | Deploys to production (manual only) |

### PR Workflow (`.github/workflows/pr.yml`)

Triggered on:
- Pull request opened, synchronized, or reopened

Jobs:
| Job | Description |
|-----|-------------|
| `pr-title` | Validates PR title follows conventional commits |
| `ci-checks` | Reuses CI workflow |
| `breaking-changes` | Checks for breaking changes in schema/API |
| `size-check` | Reports build size |
| `labeler` | Auto-labels PRs based on changed files |

## Branch Protection Rules

Configure these in GitHub Settings > Branches > Add rule:

### Main Branch Protection

```
Branch name pattern: main

Required status checks:
  ✓ lint
  ✓ test
  ✓ build
  ✓ pr-title

Additional rules:
  ✓ Require pull request reviews before merging
    - Required approving reviews: 1
  ✓ Dismiss stale pull request approvals when new commits are pushed
  ✓ Require status checks to pass before merging
  ✓ Require branches to be up to date before merging
  ✓ Require conversation resolution before merging
  ✓ Do not allow bypassing the above settings
```

### Develop Branch Protection (if using)

```
Branch name pattern: develop

Required status checks:
  ✓ lint
  ✓ test

Additional rules:
  ✓ Require pull request reviews before merging
    - Required approving reviews: 1
```

## Environment Setup

### Required Secrets

Configure in GitHub Settings > Secrets and variables > Actions:

| Secret | Description | Used In |
|--------|-------------|---------|
| `STAGING_DATABASE_URL` | Staging database connection string | CD - staging |
| `PRODUCTION_DATABASE_URL` | Production database connection string | CD - production |

### Required Variables

Configure in GitHub Settings > Secrets and variables > Actions > Variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `STAGING_URL` | Staging environment URL | `https://staging.example.com` |
| `PRODUCTION_URL` | Production environment URL | `https://example.com` |

### Environment Configuration

Create these environments in GitHub Settings > Environments:

1. **staging**
   - No protection rules (auto-deploys)

2. **production**
   - Required reviewers: Add team members
   - Wait timer: 5 minutes (optional)
   - Deployment branches: Only `main`

## Local Development

### Pre-commit Hooks

Husky is configured to run lint-staged on commit:

```bash
# Hooks run automatically, but you can run manually:
npx lint-staged
```

### Running CI Locally

```bash
# Lint
npm run lint

# Type check
npm run typecheck

# Tests
npm run test

# Tests with coverage
npm run test:coverage

# Format code
npm run format

# Build
npm run build
```

## Docker

### Build locally

```bash
docker build -t email-marketing .
```

### Run locally

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="your-secret" \
  email-marketing
```

## Conventional Commits

PR titles must follow conventional commits format:

```
type(scope): description

Examples:
feat: add user management page
fix: resolve login redirect issue
docs: update API documentation
refactor(auth): simplify token validation
test: add unit tests for user API
chore: update dependencies
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

## Troubleshooting

### CI Fails on PR

1. Check the failing job in GitHub Actions
2. Review the logs for specific errors
3. Common issues:
   - Lint errors: Run `npm run lint` locally
   - Type errors: Run `npm run typecheck` locally
   - Test failures: Run `npm run test` locally

### Build Fails

1. Ensure Prisma schema is valid: `npx prisma validate`
2. Generate Prisma client: `npx prisma generate`
3. Check for missing environment variables

### Deployment Issues

1. Check Docker build logs
2. Verify environment variables are set
3. Check database connectivity
4. Review application logs in the deployment environment
