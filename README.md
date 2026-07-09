# MMG IOS / Kairos Operating System

MMG IOS is the native iOS foundation and canonical GitHub repository for the Mindset Media Group / Kairos operating system.

This repository stores and versions the connected MMG ecosystem: native iOS source, Kairos platform architecture, Shopify site source, assets, documentation, registries, backlog records, QA notes, and release packages.

## Product Direction

Kairos is the flagship operating platform for MMG. The long-term architecture treats the MMG website, customer portal, admin portal, publishing workflows, production workflows, growth workflows, quality workflows, release workflows, and future native app experience as parts of one connected operating system.

## Repository Structure

- MMGIOS.xcodeproj: Native iOS project file.
- MMGIOS: SwiftUI application source.
- shopify: Shopify site source, page code, product code, snippets, templates, and deployment notes.
- kairos: Kairos platform architecture, command centers, modules, data models, and operating logic.
- assets: Brand assets, image references, prompts, logos, covers, and visual systems.
- docs: Doctrine, standards, architecture notes, and technical decisions.
- registry: Page, product, campaign, release, asset, and editorial registries.
- backlog: Production backlog, blockers, implementation queues, and execution sequencing.
- releases: Release packages, QA records, changelogs, and deployment summaries.

## Native iOS Build Scope

The current native app scaffold establishes:

- SwiftUI application entry point
- Authentication gate and local session persistence
- Role-gated tab shell
- Kairos Command Center registry
- Customer Portal workspace
- Project Board workspace
- Publishing Command Center
- Production Command Center
- Quality and Release Center
- Release Package Builder
- Growth Campaign Engine
- System status workspace
- Local JSON persistence stores for current vertical slices
- XcodeGen project configuration

## Local Development

Use the project make targets to bootstrap, generate, and open the native project. Run the MMGIOS scheme on an iPhone simulator.

Minimum target: iOS 17.0.

## Build Validation

GitHub Actions contains the canonical native iOS validation workflow at `.github/workflows/ios-manual-validation.yml`.

The workflow is manual-only. It checks out the requested ref, installs XcodeGen, regenerates the Xcode project, resolves package dependencies, runs a Debug iOS Simulator build with code signing disabled, and verifies the permanent runtime foundation source files.

Use branch `main` for post-merge validation. Use a specific branch, tag, or SHA only when validating a pull request head or focused recovery branch.

## Execution Mode

Kairos implementation work should run in coherent production batches. Each batch should inspect the relevant source, make only the necessary changes, validate where the environment permits, commit the completed unit of work, and then proceed to the next batch by executive direction.

During rapid development, commits should preserve GitHub Actions minutes until final validation is explicitly approved.

## Operating Rule

All production-ready page source code, product source code, and release documentation should be preserved in complete form. Do not store shortened, representative, placeholder, or partial production source when the full version is available.
