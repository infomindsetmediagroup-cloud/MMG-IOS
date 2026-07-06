import Foundation

// MARK: - Unified Export Pipeline

public enum PublishingExportKind: String, Codable, CaseIterable, Identifiable {
    case kindlePackage
    case epub
    case printReadyPDF
    case paperbackWrapPDF
    case webReaderBundle
    case mobileReaderBundle
    case productionArchive

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .kindlePackage: return "Kindle Package"
        case .epub: return "EPUB"
        case .printReadyPDF: return "Print-Ready PDF"
        case .paperbackWrapPDF: return "Paperback Wrap PDF"
        case .webReaderBundle: return "Web Reader Bundle"
        case .mobileReaderBundle: return "Mobile Reader Bundle"
        case .productionArchive: return "Production Archive"
        }
    }
}

public enum PublishingExportState: String, Codable, CaseIterable, Identifiable {
    case notStarted
    case waitingForValidation
    case ready
    case exporting
    case complete
    case blocked

    public var id: String { rawValue }
}

public struct PublishingExportRequest: Identifiable, Codable, Hashable {
    public let id: UUID
    public var projectID: UUID
    public var kinds: [PublishingExportKind]
    public var requestedAt: Date
    public var requiresHumanApproval: Bool

    public init(
        id: UUID = UUID(),
        projectID: UUID,
        kinds: [PublishingExportKind],
        requestedAt: Date = .now,
        requiresHumanApproval: Bool = true
    ) {
        self.id = id
        self.projectID = projectID
        self.kinds = kinds
        self.requestedAt = requestedAt
        self.requiresHumanApproval = requiresHumanApproval
    }
}

public struct PublishingExportPlan: Identifiable, Codable, Hashable {
    public let id: UUID
    public var request: PublishingExportRequest
    public var state: PublishingExportState
    public var issues: [PublishingValidationIssue]
    public var deliverableNames: [String]

    public init(
        id: UUID = UUID(),
        request: PublishingExportRequest,
        state: PublishingExportState,
        issues: [PublishingValidationIssue],
        deliverableNames: [String]
    ) {
        self.id = id
        self.request = request
        self.state = state
        self.issues = issues
        self.deliverableNames = deliverableNames
    }
}

public enum PublishingExportPlanner {
    public static func makePlan(
        project: PublishingProject,
        document: BookEditorDocument?,
        coverAssembly: CoverAssemblyResult?,
        kinds: [PublishingExportKind]
    ) -> PublishingExportPlan {
        let request = PublishingExportRequest(projectID: project.id, kinds: kinds)
        var issues = project.validationIssues

        if document == nil {
            issues.append(.init(title: "Interior Missing", message: "Generate or upload manuscript content before export.", severity: .blocking, affectedArea: "Interior"))
        }

        if kinds.contains(.paperbackWrapPDF), coverAssembly?.isExportReady != true {
            issues.append(.init(title: "Paperback Wrap Not Ready", message: "Paperback export requires validated cover assembly dimensions and resolved blocking cover issues.", severity: .blocking, affectedArea: "Cover"))
        }

        let blocked = issues.contains { $0.severity == .blocking }
        return PublishingExportPlan(
            request: request,
            state: blocked ? .blocked : .ready,
            issues: issues,
            deliverableNames: makeDeliverableNames(project: project, kinds: kinds)
        )
    }

    private static func makeDeliverableNames(project: PublishingProject, kinds: [PublishingExportKind]) -> [String] {
        let slug = project.title
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .filter { $0.isLetter || $0.isNumber || $0 == "-" }

        return kinds.map { kind in
            switch kind {
            case .kindlePackage: return "\(slug)-kindle-package.zip"
            case .epub: return "\(slug).epub"
            case .printReadyPDF: return "\(slug)-interior-print-ready.pdf"
            case .paperbackWrapPDF: return "\(slug)-paperback-wrap.pdf"
            case .webReaderBundle: return "\(slug)-web-reader.zip"
            case .mobileReaderBundle: return "\(slug)-mobile-reader.zip"
            case .productionArchive: return "\(slug)-production-archive.zip"
            }
        }
    }
}
