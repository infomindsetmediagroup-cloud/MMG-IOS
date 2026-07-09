import Foundation
import SwiftData

@Model
final class IntegrationConnectorRecord {
    @Attribute(.unique) var id: String
    var provider: String
    var category: String
    var displayName: String
    var accountHandle: String
    var status: String
    var authMode: String
    var capabilityRawValues: [String]
    var lastHealthCheckAt: Date?
    var lastConnectedAt: Date?
    var lastError: String
    var isProductionEnabled: Bool
    var notes: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        provider: IntegrationProvider,
        category: IntegrationCategory? = nil,
        displayName: String,
        accountHandle: String = "",
        status: IntegrationConnectionStatus = .notConfigured,
        authMode: IntegrationAuthMode = .oauth,
        capabilities: [IntegrationCapability] = [],
        lastHealthCheckAt: Date? = nil,
        lastConnectedAt: Date? = nil,
        lastError: String = "",
        isProductionEnabled: Bool = false,
        notes: String = ""
    ) {
        self.id = id
        self.provider = provider.rawValue
        self.category = (category ?? provider.defaultCategory).rawValue
        self.displayName = displayName
        self.accountHandle = accountHandle
        self.status = status.rawValue
        self.authMode = authMode.rawValue
        self.capabilityRawValues = capabilities.map(\.rawValue)
        self.lastHealthCheckAt = lastHealthCheckAt
        self.lastConnectedAt = lastConnectedAt
        self.lastError = lastError
        self.isProductionEnabled = isProductionEnabled
        self.notes = notes
        self.createdAt = .now
        self.updatedAt = .now
    }

    var capabilities: [IntegrationCapability] {
        capabilityRawValues.compactMap { IntegrationCapability(rawValue: $0) }
    }
}
