import Foundation

// MARK: - Continuous Site Intelligence Engine

public enum SiteFindingSeverity: String, Codable, CaseIterable, Identifiable {
    case critical
    case high
    case medium
    case low

    public var id: String { rawValue }
}

public enum SiteFindingDiscipline: String, Codable, CaseIterable, Identifiable {
    case engineering
    case userExperience
    case publishing
    case seo
    case content
    case marketing
    case accessibility
    case performance
    case security

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .engineering: return "Engineering"
        case .userExperience: return "UX"
        case .publishing: return "Publishing"
        case .seo: return "SEO"
        case .content: return "Content"
        case .marketing: return "Marketing"
        case .accessibility: return "Accessibility"
        case .performance: return "Performance"
        case .security: return "Security"
        }
    }
}

public enum SiteProductionBatchState: String, Codable, CaseIterable, Identifiable {
    case analyze
    case generateImprovements
    case validate
    case preparePackage
    case awaitingApproval
    case deploy
    case verify
    case resumeAnalysis

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .analyze: return "Analyze"
        case .generateImprovements: return "Generate Improvements"
        case .validate: return "Validate"
        case .preparePackage: return "Prepare Package"
        case .awaitingApproval: return "Awaiting Approval"
        case .deploy: return "Deploy"
        case .verify: return "Verify"
        case .resumeAnalysis: return "Resume Analysis"
        }
    }
}

public struct SiteIntelligenceFinding: Identifiable, Codable, Hashable {
    public let id: UUID
    public var title: String
    public var reason: String
    public var expectedImpact: String
    public var estimatedEffort: String
    public var dependencies: [String]
    public var proposedImplementation: String
    public var severity: SiteFindingSeverity
    public var discipline: SiteFindingDiscipline
    public var affectedURL: URL?

    public init(
        id: UUID = UUID(),
        title: String,
        reason: String,
        expectedImpact: String,
        estimatedEffort: String,
        dependencies: [String] = [],
        proposedImplementation: String,
        severity: SiteFindingSeverity,
        discipline: SiteFindingDiscipline,
        affectedURL: URL? = nil
    ) {
        self.id = id
        self.title = title
        self.reason = reason
        self.expectedImpact = expectedImpact
        self.estimatedEffort = estimatedEffort
        self.dependencies = dependencies
        self.proposedImplementation = proposedImplementation
        self.severity = severity
        self.discipline = discipline
        self.affectedURL = affectedURL
    }
}

public struct SiteProductionBatch: Identifiable, Codable, Hashable {
    public let id: UUID
    public var title: String
    public var state: SiteProductionBatchState
    public var findings: [SiteIntelligenceFinding]
    public var requiresApproval: Bool
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        title: String,
        state: SiteProductionBatchState = .analyze,
        findings: [SiteIntelligenceFinding] = [],
        requiresApproval: Bool = true,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.title = title
        self.state = state
        self.findings = findings
        self.requiresApproval = requiresApproval
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum ContinuousSiteIntelligenceEngine {
    public static let canonicalWorkflow: [SiteProductionBatchState] = [
        .analyze,
        .generateImprovements,
        .validate,
        .preparePackage,
        .awaitingApproval,
        .deploy,
        .verify,
        .resumeAnalysis
    ]

    public static func prioritize(_ findings: [SiteIntelligenceFinding]) -> [SiteIntelligenceFinding] {
        findings.sorted { first, second in
            severityRank(first.severity) < severityRank(second.severity)
        }
    }

    public static func makeBatch(title: String, findings: [SiteIntelligenceFinding]) -> SiteProductionBatch {
        SiteProductionBatch(title: title, state: .preparePackage, findings: prioritize(findings), requiresApproval: true)
    }

    private static func severityRank(_ severity: SiteFindingSeverity) -> Int {
        switch severity {
        case .critical: return 0
        case .high: return 1
        case .medium: return 2
        case .low: return 3
        }
    }
}

public extension SiteProductionBatch {
    static let sample = SiteProductionBatch(
        title: "Publishing Services Upgrade",
        state: .awaitingApproval,
        findings: [
            SiteIntelligenceFinding(
                title: "Add paperback publishing option",
                reason: "Smart Cover Assembly Engine can support deterministic paperback wrap generation after page count and print specs are validated.",
                expectedImpact: "Expands service value without introducing uncontrolled production risk.",
                estimatedEffort: "Medium",
                dependencies: ["Validated paperback templates", "KDP print specs", "Approval workflow"],
                proposedImplementation: "Add paperback as a selectable publishing-service upgrade gated behind validated print specs and human approval.",
                severity: .high,
                discipline: .publishing
            )
        ]
    )
}
