# Orra

An AI-native, chat-first visual creation app for posts, carousels, image editing, uploaded asset workflows, and trend-template workflows.

Users describe what they want. Orra plans internally. The user approves. Only then does Orra generate or modify layered editable artifacts.

**Orra is not Canva.** It's not Figma. It's not a traditional drag-and-drop editor with AI added later. The editor is a refinement layer. Chat is the main control surface.

## Features

- **Chat-driven creation**: Describe your idea, and Orra suggests a visual direction before generating
- **Layered artifacts**: Edit and refine generated posts and carousels with precision
- **Multiple workflows**:
  - Single posts
  - Carousels (multi-card sequences)
  - Image editing and transformations
  - Asset-based workflows
  - Trend-template workflows
- **Brand-aware generation**: Optional brand system context (colors, typography, tone)
- **Credit system**: Usage tracked and controlled, with approval gates before generation

## Tech Stack

- **Frontend**: Vite + React 19 + TypeScript + Zustand
- **Backend API**: Cloudflare Workers + Hono + TypeScript
- **Queue Consumer**: Cloudflare Workers
- **Database**: Supabase (PostgreSQL)
- **Storage**: Cloudflare R2 (object storage)
- **Auth**: Clerk
- **AI**: OpenAI, Google Gemini, Flux (modular provider routing)
- **Monorepo**: pnpm workspaces

### Packages

- `apps/api` — Hono-based REST API on Cloudflare Workers
- `apps/consumer` — Queue consumer for async generation jobs
- `apps/web` — React frontend (Vite)
- `packages/ai` — AI provider abstraction and prompt logic
- `packages/db` — Database utilities and schema
- `packages/renderer` — Artifact rendering and kernel (mutation rules)
- `packages/shared` — Shared types and utilities
- `packages/ui` — React UI components

## Prerequisites

- **Node.js** 18+ and **pnpm** 9+
- **Cloudflare account** (with API token for Workers deployment)
- **Supabase project** (database)
- **Clerk account** (authentication)
- **AI provider keys** (OpenAI and/or Gemini, depending on your configuration)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/esamxz/orra.git
cd orra
pnpm install
```

### 2. Set up environment variables

Copy the example environment files for each app:

```bash
# Frontend
cp apps/web/.env.example apps/web/.env.local

# API
cp apps/api/.dev.vars.example apps/api/.dev.vars

# Consumer
cp apps/consumer/.dev.vars.example apps/consumer/.dev.vars
```

Then fill in each file with your actual credentials:
- Supabase URL and service role key
- Clerk secret key, JWKS URL, JWT issuer
- R2 bucket credentials and account ID
- AI provider API keys (OpenAI and/or Gemini)

### 3. Run the dev environment

In separate terminals:

```bash
# Frontend (runs on http://localhost:5173)
pnpm --filter @orra/web run dev

# API (runs on http://localhost:8787)
pnpm --filter @orra/api run dev

# Run tests and typecheck
pnpm test
pnpm typecheck
pnpm build
```

## Scripts

At the repo root:

- `pnpm typecheck` — Run TypeScript type checking across all packages
- `pnpm test` — Run tests across all packages
- `pnpm build` — Build all packages and apps
- `pnpm deploy:staging:api` — Deploy API to Cloudflare staging environment
- `pnpm deploy:staging:consumer` — Deploy consumer to Cloudflare staging environment
- `pnpm deploy:staging` — Deploy both API and consumer to staging

Per-app scripts are available via `pnpm --filter <app-name> run <script>`.

## Architecture

### Dashboard

Entry point. Users:
- Enter initial prompt
- Upload optional assets
- Select optional brand
- Click create

The dashboard does **not** generate content. It creates a project, saves the first prompt, and redirects to the workspace.

### Workspace

Main creation surface for all workflows (single post, carousel, image edit, trend template). Features:
- Chat-driven edits
- Canvas preview/editor
- Approval gates before AI generation
- Credit reservation and management
- Asset panel and brand controls

### Approval Gates

No generation starts without user approval. When the user submits:
1. Workspace shows an approval card summarizing intent, visual direction, and estimated credits
2. User approves (or edits and re-approves)
3. Credits are reserved
4. Generation job queues
5. Actual cost is captured; difference is refunded

### Artifact & Kernel

`ArtifactDocument` is the source of truth. It contains:
- Metadata (project info, brand context)
- Ratio and format
- Cards (for carousels)
- Layers (backgrounds, images, text, shapes, overlays)

The **kernel** is the only writer to the artifact. Every edit is a validated action. This ensures edits are safe and reversible.

## Contributing

We welcome contributions! This is an early-stage project, so expect rapid changes.

### Before you start

1. Set up your dev environment (see "Getting Started" above)
2. Run `pnpm typecheck && pnpm test` to ensure everything works

### Making changes

- Create a feature branch (`git checkout -b feature/my-feature`)
- Make your changes
- Run tests and type checking: `pnpm typecheck && pnpm test`
- Commit and push

### PR conventions

- Write clear commit messages
- Reference any related issues
- Ensure CI/type checking passes before submitting
- Be aware that Orra is moving fast — large PRs may conflict with ongoing work

## License

Not yet licensed. All rights reserved for now.

## Status

This is an early-stage project. Core workflows (chat-driven creation, approval gates, artifact editing) are functional. Billing and premium features are in active development.

Expect breaking changes, rapid iteration, and evolving APIs as the product develops.
