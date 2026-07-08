import Foundation

enum ProjectStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case lead
    case proposal
    case approved
    case planning
    case execution
    case customerReview
    case revision
    case qualityAssurance
    case publishing
    case completed
    case archived
}

enum ProjectPriority: String, Codable, Hashable, Sendable, CaseIterable {
    case low
    case standard
    case high
    case critical
}

enum ProjectKind: String, Codable, Hashable, Sendable, CaseIterable {
    case bookPublishing
    case editing
    case coverDesign
    case websiteDevelopment
    case aiConsulting
    case marketingCampaign
    case knowledgeLibrary
    case internalOperations
    case research
    case productDevelopment
}

enum WorkOrderStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case created
    case assigned
    case accepted
    case inProgress
    case blocked
    case readyForReview
    case approved
    case completed
    case archived
}

enum TaskStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case open
    case assigned
    case inProgress
    case completed
    case verified
}

enum MilestoneStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case pending
    case active
    case completed
    case missed
    case archived
}

enum ApprovalStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case pending
    case approved
    case rejected
    case escalated
    case withdrawn
    case archived
}

enum ApprovalType: String, Codable, Hashable, Sendable, CaseIterable {
    case customer
    case executive
    case editorial
    case qualityAssurance
    case legal
    case compliance
}

enum RevisionStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case requested
    case accepted
    case inProgress
    case resolved
    case declined
    case archived
}

enum CommentVisibility: String, Codable, Hashable, Sendable, CaseIterable {
    case internalOnly
    case customerVisible
    case executiveOnly
    case system
}

struct Project: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID?
    var organizationID: UUID
    var projectNumber: String
    var name: String
    var description: String
    var projectKind: ProjectKind
    var status: ProjectStatus
    var priority: ProjectPriority
    var currentPhase: String
    var estimatedCompletionDate: Date?
    var actualCompletionDate: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ProjectTypeDefinition: KairosDomainEntity {
    let id: UUID
    var version: Int
    var projectKind: ProjectKind
    var name: String
    var description: String
    var defaultWorkflowTemplateID: UUID?
    var requiredApprovalTypes: [ApprovalType]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct WorkOrder: KairosDomainEntity {
    let id: UUID
    var version: Int
    var projectID: UUID
    var title: String
    var description: String
    var assignedDepartment: String
    var assignedUserID: UUID?
    var status: WorkOrderStatus
    var priority: ProjectPriority
    var dueDate: Date?
    var estimatedHours: Double?
    var actualHours: Double?
    var dependencyIDs: [UUID]
    var sequence: Int
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ProjectTask: KairosDomainEntity {
    let id: UUID
    var version: Int
    var workOrderID: UUID
    var title: String
    var description: String
    var status: TaskStatus
    var assignedUserID: UUID?
    var startDate: Date?
    var dueDate: Date?
    var completedDate: Date?
    var estimatedMinutes: Int?
    var actualMinutes: Int?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Milestone: KairosDomainEntity {
    let id: UUID
    var version: Int
    var projectID: UUID
    var name: String
    var sequence: Int
    var targetDate: Date?
    var completionDate: Date?
    var status: MilestoneStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Approval: KairosDomainEntity {
    let id: UUID
    var version: Int
    var relatedEntityType: String
    var relatedEntityID: UUID
    var approvalType: ApprovalType
    var requestedBy: UUID
    var requestedFrom: UUID?
    var status: ApprovalStatus
    var decisionRationale: String?
    var decidedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Revision: KairosDomainEntity {
    let id: UUID
    var version: Int
    var projectID: UUID
    var requestedBy: UUID
    var revisionNumber: Int
    var description: String
    var status: RevisionStatus
    var resolution: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ProjectComment: KairosDomainEntity {
    let id: UUID
    var version: Int
    var projectID: UUID
    var authorID: UUID?
    var body: String
    var visibility: CommentVisibility
    var relatedEntityType: String?
    var relatedEntityID: UUID?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ProjectAssignment: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var projectID: UUID
    var assigneeID: UUID
    var role: String
    var assignedAt: Date
}

struct ProjectDependency: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var projectID: UUID
    var sourceEntityType: String
    var sourceEntityID: UUID
    var dependsOnEntityType: String
    var dependsOnEntityID: UUID
    var createdAt: Date
}

struct ProjectEvent: KairosDomainEntity {
    let id: UUID
    var version: Int
    var projectID: UUID
    var eventType: String
    var summary: String
    var occurredAt: Date
    var actorID: UUID?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum ProjectValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case invalidWorkflowTransition
    case circularDependency
    case missingApproval
    case missingRequiredAsset
    case overdueWork
    case invalidAssignment
    case orphanedTask
    case duplicateMilestoneSequence
}
