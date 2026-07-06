# MMG IOS / Kairos Operating System

MMG IOS is the native iOS foundation and canonical GitHub repository for the Mindset Media Group / Kairos operating system.

This repository stores and versions the connected MMG ecosystem: native iOS source, Kairos platform architecture, Shopify site source, assets, documentation, registries, backlog records, QA notes, and release packages.

## Product Direction

Kairos is the flagship operating platform for MMG. The long-term architecture treats the MMG website, customer portal, admin portal, publishing workflows, production workflows, growth workflows, quality workflows, release workflows, and future native app experience as parts of one connected operating system.

## Repository Structure

```text
MMGIOS.xcodeproj/      Native iOS project file.
MMGIOS/                SwiftUI application source.
shopify/               Shopify site source, page code, product code, snippets, templates, and deployment notes.
kairos/                Kairos platform architecture, command centers, modules, data models, and operating logic.
assets/                Brand assets, image references, prompts, logos, covers, and visual systems.
docs/                  Doctrine, standards, architecture notes, and technical decisions.
registry/              Page, product, campaign, release, asset, and editorial registries.
backlog/               Production backlog, blockers, implementation queues, and execution sequencing.
releases/              Release packages, QA records, changelogs, and deployment summaries.
```

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

Install XcodeGen and generate the Xcode project:

```bash
make bootstrap
make generate
make open
```

Or manually:

```bash
brew install xcodegen
xcodegen generate
open MMGIOS.xcodeproj
```

Run the MMGIOS scheme on an iPhone simulator.

Minimum target: iOS 17.0.

## Build Validation

GitHub Actions contains an iOS build validation workflow at `.github/workflows/ios-build.yml`.

The workflow checks out the repository, installs XcodeGen, regenerates the Xcode project, and runs an Xcode clean build against the MMGIOS scheme on an iOS simulator.

## Operating Rule

All production-ready page source code, product source code, and release documentation should be preserved in complete form. Do not store shortened, representative, placeholder, or partial production source when the full version is available.
