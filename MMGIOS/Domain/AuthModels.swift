import Foundation

enum UserRole: String, CaseIterable, Codable, Identifiable {
    case owner = "Owner"
    case admin = "Admin"
    case operatorRole = "Operator"
    case customer = "Customer"

    var id: String { rawValue }
}

struct KairosUser: Identifiable, Codable, Hashable {
    var id: UUID
    var name: String
    var email: String
    var role: UserRole
    var lastAuthenticatedAt: Date?

    init(id: UUID = UUID(), name: String, email: String, role: UserRole, lastAuthenticatedAt: Date? = nil) {
        self.id = id
        self.name = name
        self.email = email
        self.role = role
        self.lastAuthenticatedAt = lastAuthenticatedAt
    }
}

struct AuthSession: Codable, Hashable {
    var user: KairosUser
    var isAuthenticated: Bool
    var createdAt: Date

    static let signedOut = AuthSession(
        user: KairosUser(name: "Guest", email: "guest@mindsetmediagroup.com", role: .customer),
        isAuthenticated: false,
        createdAt: Date()
    )
}
