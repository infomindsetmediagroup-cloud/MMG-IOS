import Foundation

enum WorkflowTemplateStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case draft
    case validated
    case published
    case deprecated
    case archived
}

enum WorkflowInstanceStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case created
    case running
    case waiting
    case blocked
    case escalated
    case completed
    case cancelled
    case archived
}

enum WorkflowTriggerType: String, Codable, Hashable, Sendable, CaseIterable {
    case customerRegistration
    case subscriptionActivated
    case productPurchased
    case projectCreated
    case workOrderCreated
    case fileUploaded
    case aiRecommendationAccepted
    case scheduled
    case manual
    case api
    case eventFabric
}

enum WorkflowStepType: String, Codable, Hashable, Sendable, CaseIterable {
    case humanTask
    case aiTask
    case approval
    case notification
    case dataUpdate
    case apiCall
    case documentGeneration
    case fileProcessing
    case wait
    case decision
    case parallelBranch
    case merge
    case complete
}

enum WorkflowExecutionOutcome: String, Codable, Hashable, Sendable, CaseIterable {
    case succeeded
    case failed
    case skipped
    case retried
    case cancelled
    case timedOut
}

struct WorkflowTemplate: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var description: String
    var category: String
    var templateVersion: String
    var status: WorkflowTemplateStatus
    var ownerDepartment: String
    var triggerType: WorkflowTriggerType
    var estimatedDurationMinutes: Int?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct WorkflowVersion: KairosDomainEntity {
    let id: UUID
    var version: Int
    var workflowTemplateID: UUID
    var majorVersion: Int
    var minorVersion: Int
    var status: WorkflowTemplateStatus
    var effectiveDate: Date?
    var deprecatedDate: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct WorkflowInstance: KairosDomainEntity {
    let id: UUID
    var version: Int
    var workflowTemplateID: UUID
    var workflowVersionID: UUID?
    var relatedEntityType: String
    var relatedEntityID: UUID
    var status: WorkflowInstanceStatus
    var startedAt: Date?
    var completedAt: Date?
    var initiatedBy: UUID?
    var currentStepID: UUID?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct WorkflowStep: KairosDomainEntity {
    let id: UUID
    var version: Int
    var workflowTemplateID: UUID
    var sequence: Int
    var name: String
    var description: String
    var stepType: WorkflowStepType
    var assignedDepartment: String?
    var timeoutPolicy: String?
    var retryPolicy: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct WorkflowExecution: KairosDomainEntity {
    let id: UUID
    var version: Int
    var workflowInstanceID: UUID
    var stepID: UUID
    var startedAt: Date
    var finishedAt: Date?
    var durationMilliseconds: Int?
    var outcome: WorkflowExecutionOutcome?
    var errorDetails: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ApprovalGate: KairosDomainEntity {
    let id: UUID
    var version: Int
    var workflowStepID: UUID
    var approvalType: ApprovalType
    var requiredRoleID: UUID?
    var escalationPolicy: String?
    var timeoutPolicy: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct AutomationRule: KairosDomainEntity {
    let id: UUID
    var version: Int
    var workflowTemplateID: UUID
    var trigger: WorkflowTriggerType
    var conditions: [String]
    var actions: [String]
    var enabled: Bool
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct WorkflowVariable: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var workflowInstanceID: UUID
    var key: String
    var valueType: String
    var serializedValue: String
    var createdAt: Date
    var updatedAt: Date
}

struct WorkflowEscalation: KairosDomainEntity {
    let id: UUID
    var version: Int
    var workflowInstanceID: UUID
    var workflowStepID: UUID?
    var reason: String
    var escalationLevel: Int
    var assignedTo: UUID?
    var resolvedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum WorkflowValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case circularWorkflowGraph
    case missingTerminalState
    case invalidBranching
    case missingApprovalGate
    case invalidTimeoutConfiguration
    case brokenReference
    case duplicateStepSequence
    case orphanedVariable
}
