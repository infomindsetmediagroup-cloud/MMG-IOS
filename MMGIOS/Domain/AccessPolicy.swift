import Foundation

enum AppDestination: String, CaseIterable, Identifiable {
    case command = "Command"
    case customer = "Customer"
    case projects = "Projects"
    case publishing = "Publishing"
    case admin = "Admin"
    case production = "Production"
    case quality = "Quality"
    case releases = "Releases"
    case growth = "Growth"
    case system = "System"

    var id: String { rawValue }
}

enum AccessPolicy {
    static func canAccess(_ destination: AppDestination, role: UserRole) -> Bool {
        switch role {
        case .owner:
            return true
        case .admin:
            return true
        case .operatorRole:
            return [.command, .customer, .projects, .publishing, .production, .quality, .releases, .system].contains(destination)
        case .customer:
            return [.customer, .system].contains(destination)
        }
    }

    static func visibleDestinations(for role: UserRole) -> [AppDestination] {
        AppDestination.allCases.filter { canAccess($0, role: role) }
    }
}
