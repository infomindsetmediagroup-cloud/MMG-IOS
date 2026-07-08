import Foundation

enum DepartmentStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case registered
    case validated
    case published
    case available
    case maintenance
    case retired
}

enum DepartmentCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case executive
    case publishing
    case website
    case marketing
    case customerSuccess
    case operations
    case knowledge
    case finance
    case compliance
    case analytics
    case growth
    case content
    case support
}

enum DepartmentExecutionStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case queued
    case contextAssembly
    case constitutionalValidation
    case knowledgeRetrieval
    case toolExecution
    case collaboration
    case qualityReview
    case completed
    case failed
    case recorded
}

enum ToolCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case knowledge
    case customer
    case workflow
    case project
    case commerce
    case publishing
    case analytics
    case search
    case files
    case notifications
    case scheduling
    case ai
    case integrations
}

enum ToolInvocationStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case pending
    case authorized
    case running
    case completed
    case failed
    case denied
}

enum DepartmentMemoryType: String, Codable, Hashable, Sendable, CaseIterable {
    case operational
    case customer
    case project
    case analytical
    case session
    case retainedKnowledge
}

struct Department: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var displayName: String
    var description: String
    var category: DepartmentCategory
    var status: DepartmentStatus
    var defaultModel: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct DepartmentProfile: KairosDomainEntity {
    let id: UUID
    var version: Int
    var departmentID: UUID
    var mission: String
    var responsibilities: [String]
    var expertise: [String]
    var outputTypes: [String]
    var routingPriority: Int
    var escalationPolicy: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct DepartmentExecution: KairosDomainEntity {
    let id: UUID
    var version: Int
    var departmentID: UUID
    var sessionID: UUID?
    var customerID: UUID?
    var projectID: UUID?
    var status: DepartmentExecutionStatus
    var startedAt: Date?
    var completedAt: Date?
    var durationMilliseconds: Int?
    var confidenceScore: Double?
    var outcome: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Tool: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var description: String
    var category: ToolCategory
    var toolVersion: String
    var permissionRequirements: [String]
    var allowedDepartmentIDs: [UUID]
    var status: DepartmentStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ToolInvocation: KairosDomainEntity {
    let id: UUID
    var version: Int
    var executionID: UUID
    var toolID: UUID
    var parameters: [String: String]
    var startedAt: Date?
    var completedAt: Date?
    var resultSummary: String?
    var status: ToolInvocationStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct DepartmentMemory: KairosDomainEntity {
    let id: UUID
    var version: Int
    var departmentID: UUID
    var memoryType: DepartmentMemoryType
    var relatedEntityType: String?
    var relatedEntityID: UUID?
    var retentionPolicy: String
    var expiresAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct DepartmentCapability: KairosDomainEntity {
    let id: UUID
    var version: Int
    var departmentID: UUID
    var capabilityType: String
    var description: String
    var requiredPermissions: [String]
    var status: DepartmentStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ExecutionCollaboration: KairosDomainEntity {
    let id: UUID
    var version: Int
    var parentExecutionID: UUID
    var participatingDepartmentID: UUID
    var collaborationType: String
    var message: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum AIDepartmentValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case invalidToolPermissions
    case missingDepartmentRegistration
    case unauthorizedCapabilityAccess
    case invalidCollaborationGraph
    case missingExecutionContext
    case unsupportedToolInvocation
    case invalidMemoryRetentionPolicy
}
