# HP12 Customer Portal Design Studio

## Placement

This amendment belongs in HP12 immediately after the newest Command Center updates.

The Command Center governs the customer experience. The Design Studio is the creative production workspace inside that experience. Kairos orchestrates both.

## Doctrine

The Customer Portal must include a built-in Design Studio as a core backend and customer-facing capability from the start, not as a distant optional add-on.

The Design Studio is the creative production layer where customers can design, edit, generate, manage, store, version, and export creative assets inside the MMG/Kairos ecosystem.

The objective is not to replace professional software such as Photoshop, Canva, Premiere, or full desktop publishing suites. The objective is to provide an MMG/Kairos-native modular editing environment optimized for creators, entrepreneurs, authors, educators, and small businesses.

This is production-critical functionality because it enables live implementation testing with real customer assets while the Customer Portal backend is being built.

## Canonical Modules

### 1. Document / Book Editor

Supports books, ebooks, PDFs, guides, worksheets, workbooks, templates, product descriptions, and knowledge products.

Core responsibilities:

- Writing and rewriting
- Formatting and page structure
- Draft management
- Export preparation
- Future print and digital publishing flows

### 2. Image / Visual Editor

Supports social graphics, thumbnails, book covers, product images, promotional graphics, customer visuals, and AI-assisted image workflows.

Core responsibilities:

- Resize
- Crop
- Text overlays
- Layers
- Background removal
- Brand kit application
- AI image generation and insertion
- Export to channel-specific formats

### 3. Video / Short-Form Studio

Supports future TikTok, Reels, Shorts, promotional clips, captions, and script-to-video workflows.

Core responsibilities:

- Captions
- Clip assembly
- Voiceover support
- Thumbnail generation
- Social formatting
- Future timeline editing

### 4. Website / Landing Page Builder

Supports landing pages, product pages, lead magnets, opt-in pages, sales pages, and AI-assisted page generation connected to the MMG ecosystem.

Core responsibilities:

- Page project creation
- Section/block composition
- Copy generation
- Product and offer wiring
- Future publish/export workflows

### 5. Brand Studio

Supports customer brand kits and reusable identity systems.

Core responsibilities:

- Logos
- Colors
- Fonts
- Brand files
- Reusable visual rules
- Templates
- Customer brand guidelines

### 6. AI Workspace

Supports the Kairos assistant panel and creative intelligence workflows inside the studio.

Core responsibilities:

- Prompt library
- Content generation
- Rewriting
- Summarization
- Translation
- Audience adaptation
- Creative recommendations
- Asset conversion
- Quality improvement

### 7. Asset Library

Supports central storage for customer creative materials and generated outputs.

Core responsibilities:

- Uploads
- Generated media
- Book files
- Graphics
- Videos
- Templates
- Brand assets
- Exports
- Customer project files

## Backend Requirements

The backend must be designed around reusable production records:

- Project records
- Asset records
- Version history
- Export jobs
- Permissions
- Customer ownership
- Kairos generation history
- Brand kit references
- Customer Knowledge Vault links
- Publishing status
- Template usage

Every Design Studio project should be linkable to the Customer Knowledge Vault, Customer Dashboard, and relevant Command Center state.

## MVP Implementation Scope

The first implementation pass should prioritize practical live testing rather than full creative-suite parity.

Initial scope:

- Customer project records
- Customer asset records
- Basic upload and storage model
- Document/book project type
- Image/social asset project type
- Brand kit references
- Export job model
- Version history model
- Kairos-assisted generation/refinement hooks

Deferred scope:

- Full video timeline editing
- Advanced collaborative editing
- Marketplace template publishing
- Public website publishing automation
- Team permissions beyond the first permission model

## Execution Sequencing

After Command Center implementation work is complete, the next Customer Portal backend implementation track should add the Design Studio foundation.

Execution order:

1. Confirm Command Center state and navigation shell.
2. Add Design Studio route/module entry inside Customer Portal.
3. Add project and asset domain models.
4. Add version and export job models.
5. Wire projects/assets to Customer Knowledge Vault references.
6. Add Kairos assistant hooks for generation, refinement, resizing, conversion, and organization.
7. Test with real customer-facing assets.

## Architectural Rule

Do not build the Customer Portal as a dashboard-only experience.

The Customer Portal is a customer operating environment. The Command Center directs work. The Design Studio produces work. The Asset Library stores work. The Customer Knowledge Vault preserves context. Kairos orchestrates the complete flow.
