# MMG IOS / Kairos Operating System

MMG IOS is the native iOS foundation and canonical GitHub repository for the Mindset Media Group / Kairos operating system.

This repository stores and versions the connected MMG ecosystem: native iOS source, Kairos platform architecture, Shopify site source, page/product code, assets, documentation, registries, backlog records, QA notes, and release packages.

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
- Tab-based operational shell
- Kairos Command Center registry
- Admin Operations dashboard
- Publishing backlog workspace
- Customer Portal workspace
- Settings / system status workspace
- Xcode project structure for iOS development

## Development Notes

Open `MMGIOS.xcodeproj` in Xcode and run the `MMGIOS` scheme on an iPhone simulator.

Minimum target: iOS 17.0.

## Operating Rule

All production-ready page source code, product source code, and release documentation should be preserved in complete form. Do not store shortened, representative, placeholder, or partial production source when the full version is available.
