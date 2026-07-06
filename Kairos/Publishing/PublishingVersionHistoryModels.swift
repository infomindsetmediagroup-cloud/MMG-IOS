import Foundation

// MARK: - Publishing Version History

public enum PublishingSnapshotKind: String, Codable, CaseIterable, Identifiable {
    case manuscript
    case metadata
    case cover
    case preview
    case approval
    case export
    case fullProject

    public var id: String { rawValue }
}

public struct PublishingVersionSnapshot: Identifiable, Codable, Hashable {
    public let id: UUID
    public var projectID: UUID
    public var kind: PublishingSnapshotKind
    public var title: String
    public var summary: String
    public var revisionNumber: Int
    public var createdAt: Date
    public var createdBy: String
    public var isProductionSnapshot: Bool

    public init(
        id: UUID = UUID(),
        projectID: UUID,
        kind: PublishingSnapshotKind,
        title: String,
        summary: String,
        revisionNumber: Int,
        createdAt: Date = .now,
        createdBy: String = "Kairos",
        isProductionSnapshot: Bool = false
    ) {
        self.id = id
        self.projectID = projectID
        self.kind = kind
        self.title = title
        self.summary = summary
        self.revisionNumber = revisionNumber
        self.createdAt = createdAt
        self.createdBy = createdBy
        self.isProductionSnapshot = isProductionSnapshot
    }
}

public struct PublishingVersionTimeline: Identifiable, Codable, Hashable {
    public let id: UUID
    public var projectID: UUID
    public var snapshots: [PublishingVersionSnapshot]

    public init(id: UUID = UUID(), projectID: UUID, snapshots: [PublishingVersionSnapshot] = []) {
        self.id = id
        self.projectID = projectID
        self.snapshots = snapshots
    }
}

public enum PublishingVersionHistoryEngine {
    public static func makeInitialTimeline(project: PublishingProject) -> PublishingVersionTimeline {
        PublishingVersionTimeline(
            projectID: project.id,
            snapshots: [
                PublishingVersionSnapshot(
                    projectID: project.id,
                    kind: .fullProject,
                    title: "Project Created",
                    summary: "Initial publishing project workspace created for \(project.title).",
                    revisionNumber: 1
                )
            ]
        )
    }

    public static func appendSnapshot(
        to timeline: PublishingVersionTimeline,
        kind: PublishingSnapshotKind,
        title: String,
        summary: String,
        production: Bool = false
    ) -> PublishingVersionTimeline {
        var updated = timeline
        let nextRevision = (updated.snapshots.map(\.revisionNumber).max() ?? 0) + 1
        updated.snapshots.append(
            PublishingVersionSnapshot(
                projectID: timeline.projectID,
                kind: kind,
                title: title,
                summary: summary,
                revisionNumber: nextRevision,
                isProductionSnapshot: production
            )
        )
        return updated
    }

    public static func latestProductionSnapshot(in timeline: PublishingVersionTimeline) -> PublishingVersionSnapshot? {
        timeline.snapshots
            .filter { $0.isProductionSnapshot }
            .sorted { $0.revisionNumber > $1.revisionNumber }
            .first
    }
}
