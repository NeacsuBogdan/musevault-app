# MuseVault

MuseVault is a production-oriented TypeScript monorepo foundation for building a modern creative vault: a place to organize, preserve, and evolve music-related ideas, assets, metadata, and workflows.

This repository currently contains only standards, tooling, CI, and developer experience infrastructure. Application code and framework-specific apps will be added later.

## Repository Structure

```text
apps/                  Deployable applications live here when created.
packages/              Shared libraries and internal packages live here.
docs/                  Architecture notes, product decisions, and operating docs.
.github/workflows/     GitHub Actions workflows for CI and pull request validation.
```

## Requirements

- Node.js 22 LTS
- pnpm 10
- Git

The repository pins expected tooling through `packageManager`, `engines`, and `.npmrc`.

## Development Workflow

Install dependencies:

```bash
pnpm install
```

Run local checks:

```bash
pnpm lint
pnpm typecheck
pnpm format:check
```

Format and fix supported files:

```bash
pnpm format
pnpm lint:fix
```

Create Conventional Commits interactively:

```bash
pnpm commit
```

## Commit Standards

MuseVault uses Conventional Commits. Commit messages are validated with Commitlint through the `commit-msg` Git hook. Pre-commit checks run lint-staged, ESLint, and Prettier against staged files.

Examples:

```text
feat: add workspace package
fix: correct lint configuration
docs: document development workflow
chore: update repository tooling
```

## CI

GitHub Actions validates dependency installation, formatting, linting, type checking, and package builds where build scripts exist.
