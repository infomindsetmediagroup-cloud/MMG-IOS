import Foundation
import SwiftUI

struct CommandCenter: Identifiable, Hashable {
    let id: UUID
    let title: String
    let subtitle: String
    let systemImage: String
    let status: CommandStatus
    let priority: CommandPriority

    init(
        id: UUID = UUID(),
        title: String,
        subtitle: String,
        systemImage: String,
        status: CommandStatus,
        priority: CommandPriority
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.status = status
        self.priority = priority
    }
}

enum CommandStatus: String, Hashable {
    case active = "Active"
    case building = "Building"
    case planned = "Planned"
    case review = "Review"

    var color: Color {
        switch self {
        case .active:
            return .green
        case .building:
            return .mmgBlue
        case .planned:
            return .secondary
        case .review:
            return .orange
        }
    }
}

enum CommandPriority: String, Hashable {
    case critical = "Critical"
    case high = "High"
    case standard = "Standard"
}

struct OperationalMetric: Identifiable, Hashable {
    let id: UUID
    let title: String
    let value: String
    let caption: String
    let systemImage: String

    init(id: UUID = UUID(), title: String, value: String, caption: String, systemImage: String) {
        self.id = id
        self.title = title
        self.value = value
        self.caption = caption
        self.systemImage = systemImage
    }
}

enum CommandCenterRegistry {
    static let commandCenters: [CommandCenter] = [
        CommandCenter(
            title: "Admin Operations Center",
            subtitle: "Internal operating layer for MMG tasks, standards, routing, and execution control.",
            systemImage: "building.2",
            status: .building,
            priority: .critical
        ),
        CommandCenter(
            title: "Publishing Command Center",
            subtitle: "Backlog, editorial production, product publishing, and canonical asset control.",
            systemImage: "books.vertical",
            status: .building,
            priority: .critical
        ),
        CommandCenter(
            title: "Production Command Center",
            subtitle: "Service delivery, customer project execution, fulfillment, and internal workload flow.",
            systemImage: "shippingbox",
            status: .building,
            priority: .critical
        ),
        CommandCenter(
            title: "Quality & Release Center",
            subtitle: "QA gates, release readiness, validation logs, and launch control.",
            systemImage: "checkmark.seal",
            status: .planned,
            priority: .high
        ),
        CommandCenter(
            title: "Growth, Marketing & Advertising",
            subtitle: "Campaigns, promotions, acquisition, lifecycle marketing, and approval-controlled launches.",
            systemImage: "megaphone",
            status: .planned,
            priority: .high
        ),
        CommandCenter(
            title: "Automation & Intelligence Center",
            subtitle: "Assisted decisions, workflow automation, signal detection, and intelligent routing.",
            systemImage: "sparkles",
            status: .planned,
            priority: .high
        )
    ]

    static let metrics: [OperationalMetric] = [
        OperationalMetric(title: "Active Centers", value: "3", caption: "Core vertical slices in build", systemImage: "bolt.circle"),
        OperationalMetric(title: "Release Gates", value: "4", caption: "Foundation QA gates planned", systemImage: "checklist"),
        OperationalMetric(title: "Customer Flow", value: "Portal-first", caption: "Canonical operating doctrine", systemImage: "person.crop.circle.badge.checkmark"),
        OperationalMetric(title: "Build Mode", value: "Enterprise", caption: "Production-ready vertical slices", systemImage: "hammer")
    ]
}
