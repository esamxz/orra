# CLAUDE.md

## Project

Orra is an AI-native visual creation platform for posts and carousel cards.

The product is chat-first.

Users describe what they want.
The AI plans internally.
The user approves a lightweight summary.
The system creates a layered editable visual artifact.

Orra is not Canva.
Orra is not Figma.
Orra is not a drag and drop editor with AI added later.

The editor exists as a refinement layer. Chat is the main control surface.

## Core product philosophy

The user directs.
The AI creates.
The app renders editable artifacts.

The product goal is to become a ChatGPT-like experience for visual content creation.

The user should be able to create polished posts and carousels with minimal manual work.

Do not design Orra as a traditional visual editor.
Do not center the product around templates.
Do not make the canvas the source of truth.

## Current project state

We have:

* Frontend design prototype files
* Main system design
* Core domain model and data architecture
* Rendering, editing, and export subsystem design
* AI workflow and generation architecture
* Business model with subscriptions, credits, and Dodo Payments

The uploaded frontend prototype is a visual and interaction reference, not the final app architecture.

The prototype should be refactored into clean React components rather than copied as one large file.

## Tech stack

Frontend:

* React
* TypeScript
* Vite
* Tailwind or CSS modules based on existing prototype structure
* Zustand for local editing state
* TanStack Query for server data
* Konva for canvas and layer rendering

Backend:

* Cloudflare Workers
* Hono
* TypeScript

Async jobs:

* Cloudflare Queues
* Dedicated consumer worker

Future heavy processing:

* Cloudflare Containers only when needed

Database:

* Supabase Postgres

Storage:

* Cloudflare R2

Auth:

* Clerk

Payments:

* Dodo Payments

Validation:

* Zod

Testing:

* Vitest for unit tests
* Playwright later for browser flows

## Architecture principle

The Artifact Document is the source of truth.

The canvas renders the document.
The canvas does not own the model.

Manual edits and AI edits must both go through the same kernel action system.

The kernel is the only writer.

Every mutation must be represented as a validated action.

## Artifact model

A single post is internally one card.

A carousel is multiple cards.

An artifact contains:

* artifact metadata
* ratio
* cards
* layers
* document version

Each card contains ordered layers.

Layer types:

* background
* image
* object
* logo
* text
* shape
* overlay

Text must always be editable.

There is only one text layer type.

Do not create separate technical layer types for:

* headline
* body
* subtitle
* CTA

Those are visual uses of the same text layer, not separate layer types.

Text layer properties include:

* content
* font family
* font size
* font weight
* line height
* letter spacing
* color
* opacity
* alignment
* position
* width
* height
* z index

Readable text must never be baked into generated images.

AI image models should generate backgrounds, scenes, textures, and objects.
The app renders readable text as editable layers.

## Brand systems

Brand systems are reusable creative context.

A brand system may contain:

* brand name
* brand description
* logo
* colors
* typography preferences
* tone of voice
* visual direction
* reference images
* examples
* rules

Brand systems are global within the user workspace.

Project uploaded assets are project-scoped.

A new project starts fresh, like a new chat.

Brand systems are the exception because they are reusable context.

Logos must never be modified by AI.

The AI may place, scale, or move a logo layer.
The AI must not alter logo pixels, recolor it, regenerate it, or distort it destructively.

## Trend templates

Trend templates are prompt examples with reference visuals.

They are not hardcoded generation modes.

A trend template contains:

* title
* description
* reference image
* prompt

When the user clicks “Use this prompt,” open a new project or workspace and prefill the chat input with the prompt.

The user can edit the prompt before sending.

Do not make trend templates into rigid classes or special engine branches.

## AI behavior

The AI has two modes.

### Conversation mode

Used when the user is brainstorming, asking questions, giving context, or refining direction.

In conversation mode:

* respond conversationally
* do not create a plan
* do not show an approval card
* do not start generation
* do not reserve credits

### Generation mode

Used when the user requests an action such as:

* create a post
* create a carousel
* make five cards
* generate a background
* turn this into a post
* create this visual

In generation mode:

1. Create an internal plan.
2. Show planning state.
3. Show only a lightweight approval card.
4. Wait for user approval.
5. Start the generation job only after approval.

The user should not see the full internal plan.

The approval card should be short and understandable.

Example approval card:

Ready to create a 5 card carousel about self improvement.

Style: calm, premium, focused
Format: Instagram 4:5
Brand: selected brand system
CTA: not set

Actions:

* Approve and create
* Add CTA
* Edit direction

Ask clarifying questions only when critical information is missing.

Default to action when reasonable.

## AI provider strategy

Do not hardcode one provider.

Build provider routing from the beginning.

Expected providers:

Text and planning:

* Gemini 2.5 Flash Lite
* GPT-5 nano as possible cheap fallback

Vision:

* Gemini 2.5 Flash Lite

Image generation:

* FLUX Schnell for cheap background generation
* FLUX Kontext Pro for image editing and transformations
* Gemini image models as possible fallback or premium mode

The provider router must support:

* cheap default model
* premium model
* fallback provider
* timeout handling
* retry limits
* cost tracking
* failure reporting

## Region based editing

Region based editing is non destructive in v1.

The user selects an area and gives an instruction.

Example:

Add a dog here.

The system should:

1. Understand the current scene.
2. Understand lighting, scale, perspective, and visual style.
3. Generate a compatible transparent object.
4. Add it as a new editable object layer.

Do not repaint or destructively edit the background in v1.

If the user asks for destructive edits such as removing objects or changing the entire scene, steer toward full background regeneration or explain the limitation gracefully.

## Frontend design direction

Use the uploaded frontend prototype as the visual reference.

Preserve the overall feeling:

* calm
* premium
* minimal
* blue gray palette
* quiet creative studio
* not colorful SaaS
* not childish
* not Canva like

Existing palette:

* #1d2a30
* #354e53
* #5e7680
* #a4b7bd
* #c8d1d8

Existing typography direction:

* Newsreader for display
* Hanken Grotesk for UI

The prototype already contains:

* dashboard
* creation panel
* project cards
* trend template cards
* brand system cards
* workspace
* top bar
* chat director panel
* artifact preview
* carousel rail
* inspector panel
* approval card
* composer
* export menu
* usage status
* version history
* light and dark mode direction

Refactor the prototype into clean components.

Do not keep large monolithic files.

## Required frontend component direction

Suggested structure:

apps/web/src/App.tsx
apps/web/src/pages/DashboardPage.tsx
apps/web/src/pages/WorkspacePage.tsx

apps/web/src/components/dashboard/CreateProjectPanel.tsx
apps/web/src/components/dashboard/ProjectCard.tsx
apps/web/src/components/dashboard/TrendTemplateCard.tsx
apps/web/src/components/dashboard/BrandSystemCard.tsx

apps/web/src/components/workspace/WorkspaceTopbar.tsx
apps/web/src/components/workspace/DirectorPanel.tsx
apps/web/src/components/workspace/Composer.tsx
apps/web/src/components/workspace/ArtifactStage.tsx
apps/web/src/components/workspace/CarouselRail.tsx
apps/web/src/components/workspace/InspectorPanel.tsx
apps/web/src/components/workspace/ApprovalCard.tsx
apps/web/src/components/workspace/UsageStatus.tsx

apps/web/src/components/brand/CreateBrandSystemModal.tsx

apps/web/src/components/ui

Keep mocked data until backend phases begin.

## Workspace UX requirements

Workspace must include:

* left Director chat panel
* resizable left panel
* main artifact preview area
* bottom carousel rail when artifact is carousel
* contextual inspector panel
* top bar with project controls
* brand selector
* ratio selector
* undo and redo
* autosave status
* usage status
* export button
* light and dark mode toggle

The carousel rail must be visible for carousel projects.

Users must be able to click a slide thumbnail and switch the active card.

Do not hide slide navigation inside a menu.

## Usage status

Show usage status in the top bar.

Example:

620 / 800 credits

Clicking opens a usage popover showing:

* current plan
* monthly credits used
* monthly credits remaining
* top up credits
* reset date
* recent usage
* buy credits button
* upgrade button

Also show usage status on dashboard as a small card.

## Billing and credits

Use Dodo Payments.

Dodo handles:

* checkout
* subscriptions
* invoices
* payment status
* webhooks

Orra owns:

* plan access
* credits
* usage ledger
* AI job cost
* failed job refunds
* monthly resets
* top up credits
* feature limits

Plans:

Free:

* 50 credits

Creator:

* $12 per month
* 800 credits

Pro:

* $24 per month
* 2200 credits

Studio later:

* $49 per month
* 5500 credits

Credits should be charged for expensive AI actions only.

Charge credits for:

* background generation
* object generation
* region based edit
* trend image transformation
* premium generation
* full carousel generation

Do not charge credits for:

* normal chat
* manual text edits
* changing fonts
* moving layers
* changing colors
* undo and redo
* export
* project duplication

Use a credit ledger.

Do not rely only on a credits_remaining field.

Credit flow:

1. Estimate maximum cost.
2. Reserve credits.
3. Run job.
4. Capture actual cost on success.
5. Refund difference.
6. Refund everything on failure.

Subscription credits reset monthly.

Top up credits should not expire.

Spend subscription credits first, then top up credits.

## Data and ownership

Use workspace ownership from the start.

Even if v1 has only personal workspaces, create the data model so teams can be added later.

A workspace owns:

* projects
* brand systems
* assets
* artifacts
* credits
* subscription

A user joins workspaces through membership.

Do not design content as directly user owned if workspace ownership is available.

## Storage

Use Cloudflare R2 for:

* uploaded project assets
* brand logos
* brand references
* generated backgrounds
* generated object layers
* exported PNG files
* exported ZIP files
* trend template reference images

Do not store image bytes in Postgres.

Postgres stores metadata and R2 keys.

## Export

Single post export:

* PNG

Carousel export:

* ZIP containing PNG files

No PDF export.

Support multiple aspect ratios:

* 1:1
* 4:5
* 9:16
* 16:9
* custom later

Export should use the renderer, not a screenshot of the visible UI.

## Development rules

Build in small phases.

Do not implement unrelated systems in the same phase.

Every phase must have:

* clear scope
* tests where applicable
* typecheck
* build check
* final report

Do not jump to backend before the shared document model and renderer are solid.

Do not implement AI before the approval flow and artifact model are solid.

Do not implement payments before the credit ledger is designed and tested.

## Implementation order

Recommended order:

1. Monorepo foundation
2. Shared Artifact Document schemas
3. Kernel actions and tests
4. Frontend prototype refactor into real React components
5. Mock artifact renderer
6. Konva renderer
7. Text layer selection and inspector
8. Carousel rail
9. Undo and redo
10. PNG export
11. ZIP export
12. Supabase schema
13. Clerk auth
14. Project CRUD
15. Artifact persistence
16. Brand system CRUD
17. R2 uploads
18. Chat persistence
19. Planning and approval card
20. Fake generation job
21. Cloudflare Queue consumer
22. Credit ledger
23. Dodo Payments
24. AI provider router
25. Real image generation
26. Region based editing
27. Hardening and rate limits

## Coding standards

Use TypeScript strictly.

Prefer explicit types.

Use Zod for runtime validation.

Keep shared contracts in packages/shared.

Avoid duplicating types between frontend and backend.

Keep business logic out of React components.

Keep route handlers thin.

Put domain logic in services.

Put mutation rules in the kernel.

Do not let AI output directly mutate artifacts.

Do not make the UI source of truth.

## Git rules

Do not run:

* git add
* git commit
* git push
* git reset
* git checkout
* git clean

The human owner handles git operations manually.

You may inspect git status if useful, but do not stage, commit, push, reset, or delete git history.

## Safety and implementation discipline

Before editing:

1. Inspect relevant files.
2. Understand current structure.
3. Make a short implementation plan.
4. Edit only files required for the phase.
5. Run tests and typecheck.
6. Report exactly what changed.

If a task is too large, split it.

If requirements conflict, stop and explain the conflict.

If a design document says one thing and existing code says another, report the mismatch before forcing a broad rewrite.

## UI copy rules

Use clear, short UI copy.

Avoid unnecessary dash punctuation.

Prefer heading plus subtitle.

Bad:

Create brand system — teach Orra your style

Good:

Create brand system
Teach Orra your style

Keep UI text calm, direct, and premium.

Avoid marketing fluff.

Avoid buzzwords.

## Non goals for early phases

Do not build collaboration.

Do not build teams UI.

Do not build mobile app.

Do not build PDF export.

Do not build advanced inpainting.

Do not build full server side rendering for export unless specifically requested.

Do not build every AI provider at once.

Do not build a template marketplace.

Do not overbuild billing before the credit ledger works.

## Final response format for coding tasks

At the end of every coding task, report:

* Summary
* Files changed
* Tests run
* Typecheck result
* Build result
* Known issues
* Deviations from the requested scope
* Recommended next step
