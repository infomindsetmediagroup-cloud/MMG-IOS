import Foundation

// MARK: - Publishing Approval Workflow

public enum PublishingApprovalRole: String, Codable, CaseIterable, Identifiable {
    case customer
    case editor
    case productionLead
    case administrator

    public var id: String { rawValue }
}

public enum PublishingApprovalDecision: String, Codable, CaseIterable, Identifiable {
    case pending
    case approved
    case changesRequested
    case rejected

    public var id: String { rawValue }
}

public struct PublishingApprovalCheckpoint: Identifiable, Codable, Hashable {
    public let id: UUID
    public var title: String
    public var role: PublishingApprovalRole
    public var decision: PublishingApprovalDecision
    public var notes: String
    public var decidedAt: Date?

    public init(
        id: UUID = UUID(),
        title: String,
        role: PublishingApprovalRole,
        decision: PublishingApprovalDecision = .pending,
        notes: String = "",
        decidedAt: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.role = role
        self.decision = decision
        self.notes = notes
        self.decidedAt = decidedAt
    }
}

public struct PublishingApprovalWorkflow: Identifiable, Codable, Hashable {
    public let id: UUID
    public var projectID: UUID
    public var checkpoints: [PublishingApprovalCheckpoint]
    public var requiresHumanApproval: Bool

    public var isApprovedForExport: Bool {
        checkpoints.allSatisfy { $0.decision == .approved }
    }

    public init(
        id: UUID = UUID(),
        projectID: UUID,
        checkpoints: [PublishingApprovalCheckpoint],
        requiresHumanApproval: Bool = true
    ) {
        self.id = id
        self.projectID = projectID
        self.checkpoints = checkpoints
        self.requiresHumanApproval = requiresHumanApproval
    }
}

public enum PublishingApprovalFactory {
    public static func makeDefaultWorkflow(projectID: UUID) -> PublishingApprovalWorkflow {
        PublishingApprovalWorkflow(
            projectID: projectID,
            checkpoints: [
                PublishingApprovalCheckpoint(title: "Customer Content Approval", role: .customer),
                PublishingApprovalCheckpoint(title: "Editorial Approval", role: .editor),
                PublishingApprovalCheckpoint(title: "Production Approval", role: .productionLead),
                PublishingApprovalCheckpoint(title: "Final Publication Approval", role: .administrator)
            ],
            requiresHumanApproval: true
        )
    }

    public static func approve(_ checkpoint: PublishingApprovalCheckpoint, notes: String = "") -> PublishingApprovalCheckpoint {
        var updated = checkpoint
        updated.decision = .approved
        updated.notes = notes
        updated.decidedAt = .now
        return updated
    }

    public static func requestChanges(_ checkpoint: PublishingApprovalCheckpoint, notes: String) -> PublishingApprovalCheckpoint {
        var updated = checkpoint
        updated.decision = .changesRequested
        updated.notes = notes
        updated.decidedAt = .now
        return updated
    }
}
