import Foundation

struct IntegrationConnectorService {
    func makeDefaultConnectors() -> [IntegrationConnectorRecord] {
        [
            IntegrationConnectorRecord(
                id: "integration-shopify-primary",
                provider: .shopify,
                displayName: "Shopify Storefront + Admin",
                status: .readyToConnect,
                authMode: .serverSecret,
                capabilities: [.manageProducts, .manageOrders, .readAnalytics, .webhookEvents],
                notes: "Production commerce connector. Store secrets server-side only."
            ),
            IntegrationConnectorRecord(
                id: "integration-openai-primary",
                provider: .openAI,
                displayName: "OpenAI Runtime",
                status: .readyToConnect,
                authMode: .serverSecret,
                capabilities: [.aiRuntime, .customActions],
                notes: "Kairos AI runtime connector. API key must remain server-side."
            ),
            IntegrationConnectorRecord(
                id: "integration-tiktok-primary",
                provider: .tiktok,
                displayName: "TikTok Creator Account",
                status: .readyToConnect,
                authMode: .oauth,
                capabilities: [.readProfile, .readAnalytics, .readContent, .publishContent, .webhookEvents],
                notes: "Social connector placeholder for OAuth-based TikTok account connection. Do not store username/password."
            ),
            IntegrationConnectorRecord(
                id: "integration-instagram-primary",
                provider: .instagram,
                displayName: "Instagram Business/Creator Account",
                status: .readyToConnect,
                authMode: .oauth,
                capabilities: [.readProfile, .readAnalytics, .readContent, .publishContent, .webhookEvents],
                notes: "Social connector placeholder for Meta OAuth and Instagram Graph API-style workflows."
            ),
            IntegrationConnectorRecord(
                id: "integration-facebook-primary",
                provider: .facebook,
                displayName: "Facebook Page/Profile Connector",
                status: .readyToConnect,
                authMode: .oauth,
                capabilities: [.readProfile, .readAnalytics, .readContent, .publishContent, .webhookEvents],
                notes: "Social connector placeholder for Meta OAuth and Facebook API-style workflows."
            ),
            IntegrationConnectorRecord(
                id: "integration-custom-api-template",
                provider: .customAPI,
                displayName: "Custom API Connector Template",
                status: .notConfigured,
                authMode: .custom,
                capabilities: [.customActions, .webhookEvents],
                notes: "Turnkey template for future plug-and-play connectors."
            )
        ]
    }

    func connect(_ connector: IntegrationConnectorRecord, accountHandle: String) {
        connector.accountHandle = accountHandle
        connector.status = IntegrationConnectionStatus.connected.rawValue
        connector.lastConnectedAt = .now
        connector.lastHealthCheckAt = .now
        connector.lastError = ""
        connector.updatedAt = .now
    }

    func markNeedsReauth(_ connector: IntegrationConnectorRecord, reason: String) {
        connector.status = IntegrationConnectionStatus.needsReauth.rawValue
        connector.lastError = reason
        connector.lastHealthCheckAt = .now
        connector.updatedAt = .now
    }

    func disable(_ connector: IntegrationConnectorRecord, reason: String = "Disabled by operator.") {
        connector.status = IntegrationConnectionStatus.disabled.rawValue
        connector.lastError = reason
        connector.updatedAt = .now
    }

    func markHealthy(_ connector: IntegrationConnectorRecord) {
        connector.status = IntegrationConnectionStatus.connected.rawValue
        connector.lastHealthCheckAt = .now
        connector.lastError = ""
        connector.updatedAt = .now
    }

    func enableProduction(_ connector: IntegrationConnectorRecord) {
        connector.isProductionEnabled = true
        connector.updatedAt = .now
    }
}
