import Foundation

// MARK: - Publishing Quality Gates

public enum PublishingQualityGateArea: String, Codable, CaseIterable, Identifiable {
    case manuscript
    case metadata
    case cover
    case printSpecs
    case interior
    case accessibility
    case approval
    case export

    public var id: String { rawValue }
}

public enum PublishingQualityGateStatus: String, Codable, CaseIterable, Identifiable {
    case pending
    case passed
    case warning
    case failed

    public var id: String { rawValue }
}

public struct PublishingQualityGate: Identifiable, Codable, Hashable {
    public let id: UUID
    public var area: PublishingQualityGateArea
    public var title: String
    public var status: PublishingQualityGateStatus
    public var detail: String
    public var blocksExport: Bool

    public init(
        id: UUID = UUID(),
        area: PublishingQualityGateArea,
        title: String,
        status: PublishingQualityGateStatus = .pending,
        detail: String = "",
        blocksExport: Bool = false
    ) {
        self.id = id
        self.area = area
        self.title = title
        self.status = status
        self.detail = detail
        self.blocksExport = blocksExport
    }
}

public struct PublishingQualityReport: Identifiable, Codable, Hashable {
    public let id: UUID
    public var projectID: UUID
    public var gates: [PublishingQualityGate]
    public var generatedAt: Date

    public var isExportBlocked: Bool {
        gates.contains { $0.blocksExport && $0.status == .failed }
    }

    public var passedCount: Int {
        gates.filter { $0.status == .passed }.count
    }

    public init(id: UUID = UUID(), projectID: UUID, gates: [PublishingQualityGate], generatedAt: Date = .now) {
        self.id = id
        self.projectID = projectID
        self.gates = gates
        self.generatedAt = generatedAt
    }
}

public enum PublishingQualityGateEngine {
    public static func evaluate(
        project: PublishingProject,
        metadata: PublishingMetadataProfile?,
        document: BookEditorDocument?,
        coverAssembly: CoverAssemblyResult?,
        approval: PublishingApprovalWorkflow?
    ) -> PublishingQualityReport {
        var gates: [PublishingQualityGate] = []

        gates.append(PublishingQualityGate(
            area: .manuscript,
            title: "Manuscript Available",
            status: document == nil ? .failed : .passed,
            detail: document == nil ? "No editor document has been generated." : "Editor document is available.",
            blocksExport: true
        ))

        gates.append(PublishingQualityGate(
            area: .metadata,
            title: "Metadata Complete",
            status: metadataReady(metadata) ? .passed : .warning,
            detail: metadataReady(metadata) ? "Metadata profile is ready for review." : "Metadata requires completion before final approval.",
            blocksExport: false
        ))

        gates.append(PublishingQualityGate(
            area: .cover,
            title: "Cover Assembly Ready",
            status: coverAssembly?.isExportReady == true ? .passed : .failed,
            detail: coverAssembly?.isExportReady == true ? "Cover assembly passed validation." : "Cover assembly has unresolved blockers.",
            blocksExport: true
        ))

        gates.append(PublishingQualityGate(
            area: .approval,
            title: "Human Approval Complete",
            status: approval?.isApprovedForExport == true ? .passed : .failed,
            detail: approval?.isApprovedForExport == true ? "All required checkpoints approved." : "One or more approval checkpoints remain pending.",
            blocksExport: true
        ))

        return PublishingQualityReport(projectID: project.id, gates: gates)
    }

    private static func metadataReady(_ metadata: PublishingMetadataProfile?) -> Bool {
        guard let metadata else { return false }
        return !metadata.title.isEmpty && !metadata.authorName.isEmpty && !metadata.description.isEmpty && !metadata.categories.isEmpty && !metadata.keywords.isEmpty
    }
}
