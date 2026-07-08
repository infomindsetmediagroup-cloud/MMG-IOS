import Foundation

enum ExecutiveDashboardCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case enterpriseOverview
    case financialPerformance
    case customerIntelligence
    case aiOperations
    case publishingPipeline
    case productPortfolio
    case workflowOperations
    case security
    case governance
    case platformHealth
    case strategicRoadmap
}

enum StrategicObjectiveStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case proposed
    case approved
    case active
    case measured
    case completed
    case archived
}

enum ExecutiveRecommendationCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case growth
    case revenue
    case customerSuccess
    case costOptimization
    case aiOptimization
    case workflowImprovement
    case publishing
    case marketing
    case infrastructure
    case riskManagement
}

enum ExecutiveDecisionType: String, Codable, Hashable, Sendable, CaseIterable {
    case approve
    case reject
    case defer
    case requestRevision
    case escalate
    case archive
}

enum ExecutiveDecisionStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case generated
    case reviewed
    case approved
    case executed
    case verified
    case archived
}

struct ExecutiveWorkspace: KairosDomainEntity {
    let id: UUID
    var version: Int
    var executiveUserID: UUID
    var layoutVersion: String
    var lastOpenedAt: Date?
    var preferences: [String: String]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ExecutiveDashboard: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var category: ExecutiveDashboardCategory
    var refreshPolicy: String
    var status: ExecutiveDecisionStatus
    var displayOrder: Int
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct StrategicObjective: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var description: String
    var category: ExecutiveDashboardCategory
    var ownerID: UUID?
    var priority: ProjectPriority
    var status: StrategicObjectiveStatus
    var targetDate: Date?
    var successCriteria: [String]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ExecutiveRecommendation: KairosDomainEntity {
    let id: UUID
    var version: Int
    var category: ExecutiveRecommendationCategory
    var title: String
    var summary: String
    var supportingEvidence: [String]
    var confidence: Double
    var estimatedImpact: String
    var generatedAt: Date
    var status: ExecutiveDecisionStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ExecutiveDecision: KairosDomainEntity {
    let id: UUID
    var version: Int
    var recommendationID: UUID?
    var decisionType: ExecutiveDecisionType
    var decision: String
    var decisionMakerID: UUID
    var decisionTimestamp: Date
    var rationale: String
    var status: ExecutiveDecisionStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ExecutiveAlert: KairosDomainEntity {
    let id: UUID
    var version: Int
    var severity: AlertSeverity
    var category: ExecutiveDashboardCategory
    var summary: String
    var relatedEntityType: String?
    var relatedEntityID: UUID?
    var generatedAt: Date
    var status: AlertStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct StrategicInitiative: KairosDomainEntity {
    let id: UUID
    var version: Int
    var objectiveID: UUID
    var name: String
    var description: String
    var ownerDepartment: String
    var progress: Double
    var status: StrategicObjectiveStatus
    var expectedCompletion: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct DecisionHistory: KairosDomainEntity {
    let id: UUID
    var version: Int
    var decisionID: UUID
    var previousStatus: ExecutiveDecisionStatus?
    var newStatus: ExecutiveDecisionStatus
    var changedBy: UUID
    var rationale: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum ExecutiveMissionControlValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case missingSupportingEvidence
    case invalidObjectiveOwnership
    case duplicateStrategicInitiative
    case unauthorizedExecutiveAction
    case brokenRecommendationReference
    case invalidDecisionTransition
}
