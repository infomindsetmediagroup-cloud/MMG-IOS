import Foundation

// MARK: - Interactive Publishing Studio

public enum PublishingFormat: String, Codable, CaseIterable, Identifiable {
    case digital
    case paperback
    case hardcover

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .digital: return "Digital"
        case .paperback: return "Paperback"
        case .hardcover: return "Hardcover"
        }
    }
}

public enum PublishingStage: String, Codable, CaseIterable, Identifiable {
    case idea
    case projectCreation
    case manuscriptUpload
    case manuscriptAnalysis
    case publishingBrief
    case coverStudio
    case interiorEditor
    case formatting
    case livePreview
    case qaValidation
    case customerApproval
    case productionApproval
    case export
    case publication
    case archive

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .idea: return "Idea"
        case .projectCreation: return "Project Creation"
        case .manuscriptUpload: return "Manuscript Upload"
        case .manuscriptAnalysis: return "AI Analysis"
        case .publishingBrief: return "Publishing Brief"
        case .coverStudio: return "Cover Studio"
        case .interiorEditor: return "Interior Editor"
        case .formatting: return "Formatting"
        case .livePreview: return "Live Preview"
        case .qaValidation: return "QA Validation"
        case .customerApproval: return "Customer Approval"
        case .productionApproval: return "Production Approval"
        case .export: return "Export"
        case .publication: return "Publication"
        case .archive: return "Archive"
        }
    }
}

public enum PublishingValidationSeverity: String, Codable, CaseIterable, Identifiable {
    case info
    case warning
    case blocking

    public var id: String { rawValue }
}

public struct PublishingValidationIssue: Identifiable, Codable, Hashable {
    public let id: UUID
    public var title: String
    public var message: String
    public var severity: PublishingValidationSeverity
    public var affectedArea: String

    public init(
        id: UUID = UUID(),
        title: String,
        message: String,
        severity: PublishingValidationSeverity,
        affectedArea: String
    ) {
        self.id = id
        self.title = title
        self.message = message
        self.severity = severity
        self.affectedArea = affectedArea
    }
}

public struct PublishingReadinessScore: Codable, Hashable {
    public var metadata: Int
    public var manuscript: Int
    public var cover: Int
    public var interior: Int
    public var qa: Int
    public var approval: Int

    public var overall: Int {
        [metadata, manuscript, cover, interior, qa, approval].reduce(0, +) / 6
    }

    public init(metadata: Int, manuscript: Int, cover: Int, interior: Int, qa: Int, approval: Int) {
        self.metadata = metadata
        self.manuscript = manuscript
        self.cover = cover
        self.interior = interior
        self.qa = qa
        self.approval = approval
    }
}

public struct PublishingProject: Identifiable, Codable, Hashable {
    public let id: UUID
    public var title: String
    public var subtitle: String
    public var authorName: String
    public var formats: [PublishingFormat]
    public var currentStage: PublishingStage
    public var readiness: PublishingReadinessScore
    public var validationIssues: [PublishingValidationIssue]
    public var manuscriptWordCount: Int
    public var estimatedPageCount: Int
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        title: String,
        subtitle: String = "",
        authorName: String,
        formats: [PublishingFormat] = [.digital],
        currentStage: PublishingStage = .idea,
        readiness: PublishingReadinessScore = .init(metadata: 0, manuscript: 0, cover: 0, interior: 0, qa: 0, approval: 0),
        validationIssues: [PublishingValidationIssue] = [],
        manuscriptWordCount: Int = 0,
        estimatedPageCount: Int = 0,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.authorName = authorName
        self.formats = formats
        self.currentStage = currentStage
        self.readiness = readiness
        self.validationIssues = validationIssues
        self.manuscriptWordCount = manuscriptWordCount
        self.estimatedPageCount = estimatedPageCount
        self.updatedAt = updatedAt
    }
}

public extension PublishingProject {
    static let sample = PublishingProject(
        title: "The Creator Operating System",
        subtitle: "Build, publish, and scale your ideas",
        authorName: "Michael King",
        formats: [.digital, .paperback],
        currentStage: .coverStudio,
        readiness: .init(metadata: 90, manuscript: 82, cover: 70, interior: 66, qa: 45, approval: 20),
        validationIssues: [
            PublishingValidationIssue(title: "ISBN Pending", message: "Paperback output requires a final ISBN or approved barcode placement decision.", severity: .warning, affectedArea: "Metadata"),
            PublishingValidationIssue(title: "Back Cover Copy Missing", message: "Paperback wrap assembly needs approved back cover copy before export.", severity: .blocking, affectedArea: "Cover")
        ],
        manuscriptWordCount: 48200,
        estimatedPageCount: 214
    )
}
