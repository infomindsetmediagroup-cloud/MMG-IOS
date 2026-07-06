# MMG IOS

MMG IOS is the native iOS foundation for the Mindset Media Group™ / Kairos operating system.

This repository is being structured as a production-grade SwiftUI application for managing MMG publishing operations, customer workflows, admin command centers, service production, growth, quality, and release execution.

## Current Build Scope

The initial app scaffold establishes:

- SwiftUI application entry point
- Tab-based operational shell
- Kairos Command Center registry
- Admin Operations dashboard
- Publishing backlog workspace
- Customer Portal workspace
- Settings / system status workspace
- Xcode project structure for iOS development

## Product Direction

Kairos is the flagship operating platform for MMG. The long-term application architecture treats the MMG website, customer portal, admin portal, publishing workflows, production workflows, growth workflows, and quality workflows as parts of one connected operating system.

## Repository Structure

```text
MMGIOS.xcodeproj/
MMGIOS/
  App/
  Config/
  Domain/
  Features/
  Resources/
```

## Development Notes

Open `MMGIOS.xcodeproj` in Xcode and run the `MMGIOS` scheme on an iPhone simulator.

Minimum target: iOS 17.0.
