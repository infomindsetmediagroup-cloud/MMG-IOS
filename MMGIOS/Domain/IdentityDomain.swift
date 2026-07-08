import Foundation

protocol KairosDomainEntity: Identifiable, Codable, Hashable, Sendable {
    var id: UUID { get }
    var version: Int { get }
    var createdAt: Date { get }
    var updatedAt: Date { get }
    var trustLayerReference: UUID? { get }
}

enum AccountStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case anonymous
    case registered
    case verified
    case active
    case suspended
    case archived
    case deleted
}

enum AccountType: String, Codable, Hashable, Sendable, CaseIterable {
    case customer
    case subscriber
    case publishingClient
    case internalStaff
    case executive
    case partner
    case betaTester
}

enum SessionStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case active
    case expired
    case revoked
    case archived
}

enum AuthenticationMethod: String, Codable, Hashable, Sendable, CaseIterable {
    case emailPassword
    case magicLink
    case oauth
    case enterpriseSSO
    case futureMFA
}

struct KairosUser: KairosDomainEntity {
    let id: UUID
    var version: Int
    var email: String
    var username: String?
    var displayName: String
    var firstName: String?
    var lastName: String?
    var accountStatus: AccountStatus
    var accountTypes: Set<AccountType>
    var timeZoneIdentifier: String
    var preferredLanguage: String
    var lastLoginAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?

    init(
        id: UUID = UUID(),
        version: Int = 1,
        email: String,
        username: String? = nil,
        displayName: String,
        firstName: String? = nil,
        lastName: String? = nil,
        accountStatus: AccountStatus = .registered,
        accountTypes: Set<AccountType> = [.customer],
        timeZoneIdentifier: String = TimeZone.current.identifier,
        preferredLanguage: String = Locale.current.identifier,
        lastLoginAt: Date? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        trustLayerReference: UUID? = nil
    ) {
        self.id = id
        self.version = version
        self.email = email
        self.username = username
        self.displayName = displayName
        self.firstName = firstName
        self.lastName = lastName
        self.accountStatus = accountStatus
        self.accountTypes = accountTypes
        self.timeZoneIdentifier = timeZoneIdentifier
        self.preferredLanguage = preferredLanguage
        self.lastLoginAt = lastLoginAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.trustLayerReference = trustLayerReference
    }
}

struct UserProfile: KairosDomainEntity {
    let id: UUID
    var version: Int
    var userID: UUID
    var biography: String?
    var company: String?
    var profession: String?
    var goals: [String]
    var interests: [String]
    var preferredDashboard: String?
    var preferredAIDepartments: [UUID]
    var preferredKnowledgeCategories: [String]
    var notificationPreferenceID: UUID?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Organization: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var legalName: String?
    var organizationType: String
    var status: AccountStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Role: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var description: String
    var scope: String
    var isSystemRole: Bool
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Permission: KairosDomainEntity {
    let id: UUID
    var version: Int
    var key: String
    var name: String
    var description: String
    var category: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct UserRole: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var userID: UUID
    var roleID: UUID
    var organizationID: UUID?
    var assignedBy: UUID?
    var assignedAt: Date
    var revokedAt: Date?
}

struct RolePermission: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var roleID: UUID
    var permissionID: UUID
    var grantedAt: Date
}

struct UserSession: KairosDomainEntity {
    let id: UUID
    var version: Int
    var userID: UUID
    var authenticationMethod: AuthenticationMethod
    var deviceName: String?
    var platform: String
    var ipAddressHash: String?
    var loginAt: Date
    var expiresAt: Date
    var refreshTokenHash: String?
    var lastActivityAt: Date
    var status: SessionStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct IdentityAuditEvent: KairosDomainEntity {
    let id: UUID
    var version: Int
    var userID: UUID?
    var eventType: String
    var authenticationMethod: AuthenticationMethod?
    var result: String
    var riskLevel: String
    var occurredAt: Date
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum IdentityPermissionKey {
    static let userRead = "user.read"
    static let userManage = "user.manage"
    static let roleRead = "role.read"
    static let roleManage = "role.manage"
    static let permissionRead = "permission.read"
    static let sessionRead = "session.read"
    static let sessionRevoke = "session.revoke"
    static let executiveDashboard = "executive.dashboard"
}
