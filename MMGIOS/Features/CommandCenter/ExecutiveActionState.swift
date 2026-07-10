import SwiftUI

enum ExecutiveActionState: Equatable {
    case needsReview
    case readyToExecute
    case inProgress
    case monitor
    case completed

    var label: String {
        switch self {
        case .needsReview:
            return "Needs Review"
        case .readyToExecute:
            return "Ready"
        case .inProgress:
            return "In Progress"
        case .monitor:
            return "Monitor"
        case .completed:
            return "Complete"
        }
    }

    var tint: Color {
        switch self {
        case .needsReview:
            return .orange
        case .readyToExecute, .inProgress:
            return .mmgBlue
        case .monitor:
            return .secondary
        case .completed:
            return .green
        }
    }

    var nextStep: String {
        switch self {
        case .needsReview:
            return "Review the routed action, confirm the governing decision, then approve or redirect before execution."
        case .readyToExecute:
            return "Convert the routed action into a production task, workflow update, release step, or implementation slice."
        case .inProgress:
            return "Continue execution and update the record again when the action is completed or moved to monitoring."
        case .monitor:
            return "Track this item for context. No immediate execution step is required unless conditions change."
        case .completed:
            return "No further execution is required. Keep the record for audit history and institutional memory."
        }
    }

    static func from(record: KnowledgeVaultRecord) -> ExecutiveActionState {
        if let persisted = latestPersistedStatus(from: record.decisionHistory) {
            return persisted
        }

        let searchable = "\(record.projectContext) \(record.decisionHistory)".lowercased()

        if searchable.contains("approval") || searchable.contains("blocked") || searchable.contains("gate") || searchable.contains("decision") {
            return .needsReview
        }

        if searchable.contains("execute") || searchable.contains("production") || searchable.contains("build") || searchable.contains("workflow") || searchable.contains("release") {
            return .readyToExecute
        }

        return .monitor
    }

    private static func latestPersistedStatus(from history: String) -> ExecutiveActionState? {
        history
            .components(separatedBy: .newlines)
            .reversed()
            .compactMap { line -> ExecutiveActionState? in
                guard line.hasPrefix("Action Status:") else { return nil }
                if line.contains("Complete") { return .completed }
                if line.contains("In Progress") { return .inProgress }
                if line.contains("Ready") { return .readyToExecute }
                if line.contains("Monitor") { return .monitor }
                if line.contains("Needs Review") { return .needsReview }
                return nil
            }
            .first
    }
}

enum ExecutiveActionPriority: Equatable {
    case high
    case normal

    var label: String {
        switch self {
        case .high:
            return "High"
        case .normal:
            return "Normal"
        }
    }

    var tint: Color {
        switch self {
        case .high:
            return .orange
        case .normal:
            return .mmgBlue
        }
    }

    static func from(record: KnowledgeVaultRecord) -> ExecutiveActionPriority {
        let searchable = "\(record.projectContext) \(record.decisionHistory)".lowercased()
        if searchable.contains("approval") || searchable.contains("blocked") || searchable.contains("gate") {
            return .high
        }
        return .normal
    }
}
