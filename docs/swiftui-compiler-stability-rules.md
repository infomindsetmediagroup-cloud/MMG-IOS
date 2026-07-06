# SwiftUI Compiler Stability Rules

## Purpose

Kairos uses SwiftUI heavily. Large SwiftUI expressions can exceed the compiler's type-checking threshold. These rules govern all future SwiftUI feature work.

## Required Patterns

### 1. Split large body expressions

Do not build full feature screens inside one deeply nested `body` expression.

Use:

- private computed properties
- focused subviews
- reusable row components
- small section components

Preferred shape:

```swift
var body: some View {
    NavigationStack {
        List {
            headerSection
            recordsSection
            actionsSection
        }
    }
}

private var headerSection: some View {
    Section { ... }
}
```

### 2. Extract rows into dedicated views

Do not inline complex `NavigationLink` labels, cards, rows, or repeated list elements when they contain multiple modifiers.

Use dedicated row views:

```swift
private struct ProjectRow: View {
    let project: PersistedProjectRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(project.title)
            Text(project.statusRawValue)
        }
    }
}
```

### 3. Add explicit types where inference grows expensive

Prefer explicit types for constants used in layout, sizing, spacing, and view helpers.

```swift
let cardPadding: CGFloat = 16
let cornerRadius: CGFloat = 22
```

### 4. Avoid nested ternaries

Do not use nested ternary expressions in SwiftUI views. Replace them with a helper method or computed value.

```swift
private var statusLabel: String {
    if isBlocked { return "Blocked" }
    if isComplete { return "Complete" }
    return "Active"
}
```

### 5. Avoid long modifier chains

If a `Text`, `Image`, `Button`, or container has a long modifier chain, extract a row, component, style helper, or `ViewModifier`.

### 6. Move filtering and sorting out of body

Do not perform heavy filtering, mapping, sorting, or conversion inline inside `body`.

Use computed properties:

```swift
private var productionProjects: [PersistedProjectRecord] {
    projects.filter { $0.areaRawValue == WorkflowArea.production.rawValue }
}
```

## Current Enforcement

The following views have been refactored or partially migrated according to this rule set:

- `ProductionCommandCenterView`
- `AdminOperationsView`
- `GrowthMarketingView`

All future command center views should follow the same pattern before additional feature depth is added.
