# CLAUDE.md

## Project

Orra is an AI-native, chat-first visual creation app for posts, carousels, image editing, uploaded asset workflows, and trend-template workflows.

Users describe what they want.
Orra plans internally.
The user approves.
Only then does Orra generate or modify layered editable artifacts.

Orra is not Canva.
Orra is not Figma.
Orra is not a traditional drag-and-drop editor with AI added later.
The editor is a refinement layer. Chat is the main control surface.

## Core rule

Dashboard starts.
Workspace decides.
Approval gates generation.

The dashboard must not generate final content.

The dashboard only:

* accepts the first prompt
* accepts optional uploaded assets
* allows optional brand selection or “No brand”
* creates a project
* saves the first prompt as the first project chat message
* attaches uploaded assets to the project
* detects the initial direction
* redirects to the workspace

The workspace handles:

* approval/setup cards
* clarification
* generation decisions
* generation jobs after approval
* card-by-card carousel work
* chat-directed edits
* manual edits
* asset usage
* trend-template workflows
* export

No credits are reserved or spent from dashboard submit.

## First prompt direction

The first dashboard prompt decides the initial project direction, but does not generate output.

Directions:

* `single_post`
* `carousel`
* `image_edit`
* `trend_template`
* `unclear`

Examples:

* “Create a post about discipline” starts a single-post project.
* “Create a 5-card carousel about discipline” starts a carousel project.
* “Use these images to create a carousel” starts an asset-based carousel project.
* “Turn this image into a Minecraft effect” starts an image-edit/trend-template project.
* If unclear, create the project and ask clarification inside the workspace.

Persist the first prompt as the first project chat message.
Do not rely only on router state.

## Dashboard UX

Dashboard structure:

* Orra logo
* usage status
* upgrade button
* Clerk profile button
* central prompt composer
* upload asset button
* brand selector with “No brand”
* submit/create button
* helper chips
* Trend Templates
* Recent Projects
* Brand Systems access

Helper chips guide the prompt. They are not mandatory modes.

Examples:

* Single post
* Carousel
* Instagram
* LinkedIn
* Use image
* Brand style

Dashboard uploaded assets should be attached to the created project and shown in the workspace Assets panel.

Do not use uploaded assets for generation until workspace approval.

## Workspace UX

The workspace is one flexible creation surface for:

* posts
* carousels
* trend templates
* uploaded assets
* image editing
* future region editing
* brand-aware generation
* no-brand generation

Do not create separate apps/workspaces for post, carousel, template, or image editing.

Workspace must include:

* top bar
* back to dashboard/projects
* project title
* saved/autosave status
* usage status
* export button when artifact exists
* left chat/control panel
* main canvas/preview
* Assets/Edit/Design controls
* carousel rail when carousel
* approval/setup state before generation

The workspace chat controls editing.

Examples:

* “Make this more premium.”
* “Use image 2 for card 3.”
* “Duplicate this style to the next card.”
* “Generate a background for this card.”
* “Turn this post into a carousel.”
* “Make the title bigger.”

Chat-directed edits must become safe kernel/document actions.
Do not let AI directly mutate raw ArtifactDocument JSON.

## Approval/setup

Generation starts only after workspace approval.
Credits are reserved only after approval.

For single post:

* show approval card before generation
* summarize topic, ratio/format, brand/no-brand, uploaded assets, visual direction, estimated credits
* actions: Approve, Edit direction, Cancel

For carousel:

* do not generate cards from dashboard
* show carousel setup card in workspace
* summarize topic, card count, structure, visual direction, brand/no-brand, assets, estimated credits
* actions may include:

  * Create card by card
  * Create all cards
  * Use shared background
  * Typography only
  * Edit direction
  * Cancel

For unclear intent:

* ask clarification inside workspace

## Carousel workflow

A single post is internally one card.
A carousel is multiple cards.

Carousel is card-based by default.

User can:

* add card
* duplicate card
* delete card
* reorder card
* select card
* generate selected card
* regenerate selected card background
* apply shared style
* generate all cards only after approval

The carousel rail must stay visible for carousel projects.
Do not hide carousel navigation inside a menu.

Cards and layers stay inside ArtifactDocument JSON.
Do not create relational card/layer tables unless unavoidable.

Free actions:

* add/duplicate/delete/reorder/select cards
* edit text
* change fonts/colors
* move layers
* use uploaded assets
* reuse generated background
* undo/redo
* export unless product policy changes

Paid actions:

* full post generation
* full carousel generation
* background generation/regeneration
* object generation
* region edit
* trend image transformation
* premium generation
* product scene generation
* upscale/enhance

Carousel cost should be based on expensive AI operations, not card count alone.

## Artifact rules

ArtifactDocument is the source of truth.
The canvas only renders it.
The kernel is the only writer.
Every mutation must be a validated action.

An artifact contains:

* metadata
* ratio
* cards
* layers
* document version

Layer types:

* background
* image
* object
* logo
* text
* shape
* overlay

Text must always be editable.
Readable text must never be baked into generated images.
Generated images should be backgrounds, scenes, textures, or objects.
Use asset IDs/references, not signed URLs in ArtifactDocument.

## Brand systems

Brand is optional context, not a separate mode.

No-brand projects are valid.
If no brand is selected, use smart defaults.

Do not create separate “branded post” or “branded carousel” modes.

Brand systems may include:

* name
* description
* logo
* colors
* typography
* tone of voice
* visual direction
* reference images
* rules

Logos must never be modified by AI.
AI may place, scale, or move logo layers, but must not alter logo pixels.

## Trend templates

Trend templates are prompt/reference workflows.

They are not rigid templates.
They are not hardcoded generation modes.

A trend template may contain:

* title
* description
* reference image
* prompt
* required asset hint
* ratio/platform hint

Clicking a trend template should create or prepare a project, carry template context, redirect to workspace, show approval/setup, ask for missing assets if needed, and generate only after approval.

Do not generate trend templates directly on dashboard.

## AI behavior

Conversation mode:

* respond conversationally
* do not start generation
* do not reserve credits
* do not mutate artifacts unless the user clearly asks for an edit

Generation/setup mode:

* create internal plan
* show lightweight approval/setup card
* wait for approval
* start generation only after approval

Dashboard submit may classify direction and create project setup state, but it is not generation execution.

Do not show full internal plans to users.

Ask clarification only when critical information is missing.

## Provider rules

Do not hardcode one AI provider.

Use provider routing for:

* cheap/default models
* premium models
* fallback providers
* timeouts
* retry limits
* cost tracking
* failure reporting

Do not expose API keys to frontend.
Do not log secrets.
Do not run live provider calls in tests.

Keep fakes/mocks until dedicated replacement/cleanup phases.

## Storage and security

Use workspace ownership from the start.

Workspace owns:

* projects
* brand systems
* assets
* artifacts
* credits
* subscription

All project/chat/asset/artifact/job/export access must be workspace-scoped.

Use R2 for:

* project assets
* brand assets
* generated backgrounds/objects
* exports
* trend references

Do not store image bytes in Postgres.
Do not expose R2 keys to frontend.
Do not store signed URLs in ArtifactDocument.

## Credits

Use a credit ledger.

Do not charge credits for:

* dashboard submit
* normal chat
* manual edits
* free card actions
* using uploaded assets
* undo/redo
* export unless policy changes

Credit flow:

1. estimate max cost
2. reserve after approval
3. run job
4. capture actual cost on success
5. refund difference
6. refund all on failure

Dodo Payments is future billing work only.
Do not implement checkout/webhooks unless the phase explicitly requests payments.

## Frontend direction

Use Orra’s own identity.

Wireframes/screenshots are workflow and layout references only.
Do not clone them.

Visual direction:

* calm
* premium
* minimal
* dark-first
* blue-gray palette
* quiet creative studio
* not colorful SaaS
* not Canva-like
* not a video editor clone

Palette:

* #1d2a30
* #354e53
* #5e7680
* #a4b7bd
* #c8d1d8

Refactor large prototype files into clean components.
Do not keep monolithic UI files.

## Implementation discipline

Build in small phases.

Do not implement unrelated systems in the same phase.

Do not:

* make dashboard generate
* store first prompt only in router state
* create separate workspaces for post/carousel/template/image edit
* add payments during workflow phases
* add real provider work during workflow routing phases
* create relational card/layer tables
* bypass the kernel
* reserve credits before approval
* remove fakes/mocks too early
* over-polish before workflow is correct

Before editing:

1. inspect relevant files
2. understand current structure
3. make a short plan
4. edit only required files
5. run tests/typecheck/build
6. report exactly what changed

## Coding standards

Use TypeScript strictly.
Prefer explicit types.
Use Zod for runtime validation.
Keep shared contracts in `packages/shared`.
Keep business logic out of React components.
Keep route handlers thin.
Put domain logic in services.
Put mutation rules in the kernel.

## Git rules

Do not run:

* `git add`
* `git commit`
* `git push`
* `git reset`
* `git checkout`
* `git clean`

The human owner handles git manually.

## Non-goals for early phases

Do not build:

* collaboration
* teams UI
* mobile app
* PDF export
* advanced inpainting
* template marketplace
* every AI provider at once
* Dodo Payments before explicit billing phase

## Final response format

At the end of coding tasks, report:

* Summary
* Files created
* Files changed
* Main behavior implemented
* Tests run
* Typecheck result
* Test result
* Build result
* Known issues
* Deviations from scope
* Whether next phase can begin
* Recommended next step
