import Foundation

enum AdminModuleCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case customerManagement
    case projectManagement
    case publishingOperations
    case workflowManagement
    case aiDepartments
    case knowledgeLibrary
    case productCatalog
    case ordersBilling
    case revenueIntelligence
    case analytics
    case notifications
    case userIdentity
    case security
    case compliance
    case trustLayer
    case systemConfiguration
    case auditHistory
    case integrationManagement
    case healthMonitoring
}

enum OperationalAlertCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case security
    case compliance
    case workflow
    case infrastructure
    case customer
    case publishing
    case billing
    case ai
    case analytics
    case executive
}

enum AlertSeverity: String, Codable, Hashable, Sendable, CaseIterable {
    case informational
    case low
    case medium
    case high
    case critical
}

enum AlertStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case open
    case acknowledged
    case resolved
    case archived
}

enum AdministrativeActionResult: String, Codable, Hashable, Sendable, CaseIterable {
    case succeeded
    case failed
    case denied
    case pendingApproval
}

struct AdminWorkspace: KairosDomainEntity {
    let id: UUID
    var version: Int
    var userID: UUID
    var activeModuleID: UUID?
    var layoutVersion: String
    var preferences: [String: String]
    var lastOpenedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct AdminModule: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var category: AdminModuleCategory
    var route: String
    var requiredPermissions: [String]
    var status: String
    var displayOrder: Int
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct AdminView: KairosDomainEntity {
    let id: UUID
    var version: Int
    var moduleID: UUID
    var name: String
    var layout: String
    var filters: [String: String]
    var savedConfiguration: [String: String]
    var visibilityRules: [String]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct SavedFilter: KairosDomainEntity {
    let id: UUID
    var version: Int
    var userID: UUID
    var moduleID: UUID
    var name: String
    var criteria: [String: String]
    var isDefault: Bool
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct OperationalAlert: KairosDomainEntity {
    let id: UUID
    var version: Int
    var category: OperationalAlertCategory
    var severity: AlertSeverity
    var source: String
    var relatedEntityType: String?
    var relatedEntityID: UUID?
    var acknowledgedAt: Date?
    var status: AlertStatus
    var summary: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct AdministrativeAction: KairosDomainEntity {
    let id: UUID
    var version: Int
    var userID: UUID
    var actionType: String
    var targetEntityType: String
    var targetEntityID: UUID
    var timestamp: Date
    var result: AdministrativeActionResult
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct SystemConfiguration: KairosDomainEntity {
    let id: UUID
    var version: Int
    var category: String
    var key: String
    var value: String
    var configurationVersion: Int
    var updatedBy: UUID
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct WorkspacePreference: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var workspaceID: UUID
    var key: String
    var value: String
    var updatedAt: Date
}

enum AdministrationValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case missingPermissions
    case invalidConfigurationValue
    case duplicateModuleRegistration
    case unauthorizedBulkOperation
    case brokenSavedFilter
    case invalidWorkspaceLayout
    case configurationDependencyConflict
}
