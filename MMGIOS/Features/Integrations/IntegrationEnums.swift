import Foundation

enum IntegrationProvider: String, CaseIterable, Identifiable, Codable {
    case shopify = "Shopify"
    case openAI = "OpenAI"
    case tiktok = "TikTok"
    case instagram = "Instagram"
    case facebook = "Facebook"
    case customAPI = "Custom API"

    var id: String { rawValue }

    var defaultCategory: IntegrationCategory {
        switch self {
        case .shopify: return .commerce
        case .openAI: return .intelligence
        case .tiktok, .instagram, .facebook: return .social
        case .customAPI: return .custom
        }
    }
}

enum IntegrationCategory: String, CaseIterable, Identifiable, Codable {
    case commerce = "Commerce"
    case intelligence = "Intelligence"
    case social = "Social"
    case content = "Content"
    case analytics = "Analytics"
    case custom = "Custom"

    var id: String { rawValue }
}

enum IntegrationConnectionStatus: String, CaseIterable, Identifiable, Codable {
    case notConfigured = "Not Configured"
    case readyToConnect = "Ready To Connect"
    case connected = "Connected"
    case needsReauth = "Needs Reauthorization"
    case degraded = "Degraded"
    case disabled = "Disabled"

    var id: String { rawValue }
}

enum IntegrationAuthMode: String, CaseIterable, Identifiable, Codable {
    case oauth = "OAuth"
    case apiKey = "API Key"
    case serverSecret = "Server Secret"
    case custom = "Custom"

    var id: String { rawValue }
}

enum IntegrationCapability: String, CaseIterable, Identifiable, Codable {
    case readProfile = "Read Profile"
    case readAnalytics = "Read Analytics"
    case readContent = "Read Content"
    case publishContent = "Publish Content"
    case manageProducts = "Manage Products"
    case manageOrders = "Manage Orders"
    case aiRuntime = "AI Runtime"
    case webhookEvents = "Webhook Events"
    case customActions = "Custom Actions"

    var id: String { rawValue }
}
