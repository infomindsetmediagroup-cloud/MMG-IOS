import Foundation

enum PortalSectionType: String, Codable, Hashable, Sendable, CaseIterable {
    case welcome
    case continueWorking
    case activeProjects
    case aiDepartments
    case knowledgeLibrary
    case products
    case subscriptions
    case downloads
    case notifications
    case recommendations
    case analytics
    case recentActivity
    case savedItems
    case accountSummary
}

enum PortalWidgetType: String, Codable, Hashable, Sendable, CaseIterable {
    case summaryCard
    case projectList
    case departmentLauncher
    case recommendationList
    case activityFeed
    case downloadList
    case approvalQueue
    case knowledgeProgress
    case subscriptionStatus
}

enum RecommendationType: String, Codable, Hashable, Sendable, CaseIterable {
    case knowledge
    case product
    case aiDepartment
    case learningPath
    case workflow
    case projectNextStep
    case subscriptionBenefit
}

enum QuickActionType: String, Codable, Hashable, Sendable, CaseIterable {
    case resumeProject
    case launchDepartment
    case askKairos
    case browseKnowledgeLibrary
    case uploadFiles
    case reviewApprovals
    case continueLearning
    case contactSupport
}

enum ActivityFeedEventType: String, Codable, Hashable, Sendable, CaseIterable {
    case projectUpdate
    case aiActivity
    case knowledgeCompleted
    case download
    case purchase
    case workflowMilestone
    case notification
    case announcement
}

struct CustomerDashboard: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var layoutVersion: String
    var theme: String
    var status: String
    var lastOpenedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct DashboardSection: KairosDomainEntity {
    let id: UUID
    var version: Int
    var dashboardID: UUID
    var sectionType: PortalSectionType
    var title: String
    var displayOrder: Int
    var isExpanded: Bool
    var isPinned: Bool
    var visibilityRules: [String]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct CustomerDashboardWidget: KairosDomainEntity {
    let id: UUID
    var version: Int
    var sectionID: UUID
    var widgetType: PortalWidgetType
    var configuration: [String: String]
    var dataSource: String
    var refreshPolicy: String
    var status: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct CustomerWorkspace: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var activeProjectID: UUID?
    var activeConversationID: UUID?
    var activeDepartmentID: UUID?
    var lastContext: String?
    var lastActivityAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct CustomerRecommendation: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var recommendationType: RecommendationType
    var source: String
    var priority: Int
    var relatedEntityType: String
    var relatedEntityID: UUID
    var explanation: String
    var generatedAt: Date
    var expiresAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct QuickAction: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var actionType: QuickActionType
    var systemImage: String
    var destination: String
    var requiredEntitlementIDs: [UUID]
    var displayOrder: Int
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ActivityFeedItem: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var eventType: ActivityFeedEventType
    var summary: String
    var relatedEntityType: String?
    var relatedEntityID: UUID?
    var occurredAt: Date
    var status: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct PinnedItem: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var customerID: UUID
    var entityType: String
    var entityID: UUID
    var pinnedAt: Date
}

struct RecentItem: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var customerID: UUID
    var entityType: String
    var entityID: UUID
    var lastViewedAt: Date
}

enum CustomerPortalValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case invalidWidgetConfiguration
    case duplicateSectionOrdering
    case missingEntitlement
    case brokenRecommendationReference
    case invalidWorkspaceState
    case unsupportedWidgetType
}
