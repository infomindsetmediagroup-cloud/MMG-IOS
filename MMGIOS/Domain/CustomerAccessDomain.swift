import Foundation

enum CustomerStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case lead
    case active
    case inactive
    case suspended
    case archived
}

enum CustomerType: String, Codable, Hashable, Sendable, CaseIterable {
    case freeUser
    case subscriber
    case publishingClient
    case enterpriseCustomer
    case internalStaff
    case executive
    case partner
}

enum CustomerLifecycleStage: String, Codable, Hashable, Sendable, CaseIterable {
    case prospect
    case registered
    case onboarded
    case engaged
    case retained
    case atRisk
    case advocate
    case archived
}

enum SubscriptionStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case trial
    case active
    case gracePeriod
    case suspended
    case cancelled
    case expired
    case archived
}

enum BillingCycle: String, Codable, Hashable, Sendable, CaseIterable {
    case none
    case monthly
    case quarterly
    case annual
    case lifetime
}

enum PaymentStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case notRequired
    case pending
    case paid
    case failed
    case pastDue
    case refunded
}

enum EntitlementCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case knowledgeLibrary
    case aiDepartment
    case publishingService
    case customerPortal
    case workflowMarketplace
    case premiumTemplate
    case dashboard
    case download
    case futureCapability
}

enum LicenseType: String, Codable, Hashable, Sendable, CaseIterable {
    case permanent
    case subscription
    case trial
    case promotional
    case enterprise
}

enum LicenseStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case active
    case expired
    case revoked
    case archived
}

struct Customer: KairosDomainEntity {
    let id: UUID
    var version: Int
    var userID: UUID
    var customerNumber: String
    var status: CustomerStatus
    var customerTypes: Set<CustomerType>
    var lifecycleStage: CustomerLifecycleStage
    var acquisitionSource: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct SubscriptionPlan: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var description: String
    var billingCycle: BillingCycle
    var price: Decimal
    var currencyCode: String
    var status: SubscriptionStatus
    var displayOrder: Int
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct CustomerSubscription: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var planID: UUID
    var status: SubscriptionStatus
    var billingCycle: BillingCycle
    var startDate: Date
    var renewalDate: Date?
    var expirationDate: Date?
    var autoRenew: Bool
    var isTrial: Bool
    var paymentStatus: PaymentStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Entitlement: KairosDomainEntity {
    let id: UUID
    var version: Int
    var key: String
    var name: String
    var description: String
    var category: EntitlementCategory
    var status: String
    var requiredPlanID: UUID?
    var dependencyIDs: [UUID]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct PlanEntitlement: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var planID: UUID
    var entitlementID: UUID
    var grantedAt: Date
}

struct CustomerEntitlement: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var entitlementID: UUID
    var source: String
    var startsAt: Date
    var expiresAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Purchase: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var productID: UUID
    var orderReference: String?
    var purchaseDate: Date
    var licenseType: LicenseType
    var deliveryStatus: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct CustomerLicense: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var resourceID: UUID
    var resourceType: String
    var licenseType: LicenseType
    var status: LicenseStatus
    var effectiveDate: Date
    var expirationDate: Date?
    var usageRights: [String]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct CustomerPreferences: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var preferredCategories: [String]
    var favoriteDepartmentIDs: [UUID]
    var favoriteProductIDs: [UUID]
    var learningGoals: [String]
    var dashboardPreferences: [String: String]
    var recentActivityLimit: Int
    var personalizationEnabled: Bool
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct CustomerActivity: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID
    var activityType: String
    var relatedEntityType: String?
    var relatedEntityID: UUID?
    var summary: String
    var occurredAt: Date
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum CustomerEntitlementKey {
    static let knowledgeLibraryAccess = "knowledge.library.access"
    static let aiPublishingDepartment = "ai.department.publishing"
    static let aiMarketingDepartment = "ai.department.marketing"
    static let aiWebsiteDepartment = "ai.department.website"
    static let customerPortal = "customer.portal.access"
    static let workflowMarketplace = "workflow.marketplace.access"
    static let premiumTemplates = "templates.premium.access"
    static let executiveDashboard = "dashboard.executive.access"
}
