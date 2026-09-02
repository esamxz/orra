# Contributing to Orra

Thank you for your interest in contributing! We're excited to work with you.

## Getting Started

1. **Set up your environment** following the "Getting Started" section in [README.md](README.md)
2. **Familiarize yourself** with the project structure and architecture (see "Architecture" in README.md)
3. **Run tests** to ensure everything is working: `pnpm typecheck && pnpm test`

## Development Workflow

1. **Create a feature branch** off `main`:
   ```bash
   git checkout -b feature/my-feature-name
   ```

2. **Make your changes** in the relevant package or app

3. **Test your changes**:
   ```bash
   pnpm typecheck   # Type checking
   pnpm test        # Run tests
   pnpm build       # Build all packages
   ```

4. **Commit with clear messages**:
   - Use present tense: "Add feature" not "Added feature"
   - Reference issues if applicable: "Fix #123"
   - Example: `feat: add chat-directed edit for text layer`

5. **Push and open a PR** against `main`

## PR Guidelines

- **One feature per PR** when possible (easier to review and revert if needed)
- **Reference related issues** in the PR description
- **Include context** on why the change is needed, not just what it does
- **Test before submitting** — ensure `typecheck`, `test`, and `build` all pass
- **Be responsive** to feedback (this is an active project with evolving standards)

## Code Standards

- **TypeScript** — Use strict mode, explicit types preferred over inference
- **Runtime validation** — Use Zod for API contracts and user input
- **Business logic** — Keep out of React components; put in services
- **Shared contracts** — Store in `packages/shared`
- **No secrets in code** — Environment variables only; see [README.md](README.md#2-set-up-environment-variables)

## Important Notes

### This is an early-stage project

- Expect rapid changes and breaking updates
- Large features may be reworked or removed between phases
- Some APIs and patterns are still being refined

### Do not

- Hardcode API keys or secrets
- Commit `.env` or `.dev.vars` files with real values
- Bypass the artifact kernel for direct mutations
- Add payments/billing logic (separate phase)

## Questions?

If you have questions about the codebase or architecture, feel free to open a discussion or issue. We're here to help!
