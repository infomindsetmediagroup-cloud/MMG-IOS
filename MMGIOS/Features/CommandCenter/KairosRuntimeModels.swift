import Foundation

struct KairosRuntimeRequest: Codable, Equatable {
    let objective: String
    let department: String
    let routingConfidence: Double
    let executionPlan: [String]
    let governanceNote: String
    let source: String

    init(objective: String, decision: KairosRouteDecision, source: String = "ios-executive-chat") {
        self.objective = objective
        department = decision.department.rawValue
        routingConfidence = decision.confidence
        executionPlan = decision.executionPlan
        governanceNote = decision.governanceNote
        self.source = source
    }
}

struct KairosRuntimeResponse: Codable, Equatable {
    let message: String
    let department: String?
    let requestID: String?
    let auditID: String?

    enum CodingKeys: String, CodingKey {
        case message
        case department
        case requestID = "requestId"
        case auditID = "auditId"
    }
}

struct KairosApprovedActionRequest: Codable, Equatable {
    let actionType: String
    let objective: String
    let approval: Approval

    struct Approval: Codable, Equatable {
        let approved: Bool
        let actor: String
        let approvedAt: String
    }

    static func shopifyHomepageAudit(objective: String, approvedAt: Date = .now) -> KairosApprovedActionRequest {
        KairosApprovedActionRequest(
            actionType: "shopify.homepage.audit",
            objective: objective,
            approval: Approval(
                approved: true,
                actor: "MMG Executive",
                approvedAt: ISO8601DateFormatter().string(from: approvedAt)
            )
        )
    }
}

struct KairosActionResponse: Codable, Equatable {
    let actionID: String
    let actionType: String
    let status: String
    let startedAt: String
    let completedAt: String
    let evidence: ShopifyThemeEvidence

    struct ShopifyThemeEvidence: Codable, Equatable {
        let themeID: String
        let name: String
        let role: String
        let updatedAt: String
        let processing: Bool
        let processingFailed: Bool
        let homepageFiles: [String]
    }
}

struct KairosRuntimeErrorResponse: Codable, Equatable {
    struct Detail: Codable, Equatable {
        let code: String?
        let message: String?
        let requestID: String?

        enum CodingKeys: String, CodingKey {
            case code
            case message
            case requestID = "requestID"
        }
    }

    let error: Detail?
    let message: String?
    let requestID: String?

    enum CodingKeys: String, CodingKey {
        case error
        case message
        case requestID = "requestId"
    }

    var displayMessage: String {
        error?.message ?? message ?? "Kairos could not complete the request."
    }
}

struct KairosRuntimeConfiguration: Equatable {
    static let endpointInfoKey = "KAIROS_RUNTIME_URL"
    static let tokenInfoKey = "KAIROS_RUNTIME_TOKEN"

    let endpointURL: URL
    let accessToken: String
    let timeout: TimeInterval

    init(endpointURL: URL, accessToken: String, timeout: TimeInterval = 30) throws {
        guard Self.isAllowed(endpointURL) else {
            throw KairosRuntimeError.insecureConfiguration
        }

        let token = accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else {
            throw KairosRuntimeError.missingConfiguration
        }

        self.endpointURL = endpointURL
        self.accessToken = token
        self.timeout = timeout
    }

    static func from(bundle: Bundle = .main) throws -> KairosRuntimeConfiguration {
        guard let value = bundle.object(forInfoDictionaryKey: endpointInfoKey) as? String,
              !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let endpointURL = URL(string: value),
              let token = bundle.object(forInfoDictionaryKey: tokenInfoKey) as? String,
              !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            throw KairosRuntimeError.missingConfiguration
        }

        return try KairosRuntimeConfiguration(endpointURL: endpointURL, accessToken: token)
    }

    private static func isAllowed(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased() else {
            return false
        }

        if scheme == "https" {
            return true
        }

        return scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host)
    }
}

enum KairosRuntimeError: Error, Equatable, LocalizedError {
    case missingConfiguration
    case insecureConfiguration
    case invalidResponse
    case server(statusCode: Int, message: String)
    case transport(message: String)
    case decoding
    case actionUnavailable

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Kairos runtime is not configured."
        case .insecureConfiguration:
            return "Kairos runtime must use HTTPS."
        case .invalidResponse:
            return "Kairos returned an invalid response."
        case let .server(_, message):
            return message
        case let .transport(message):
            return message
        case .decoding:
            return "Kairos returned a response the app could not read."
        case .actionUnavailable:
            return "No execution adapter is available for this action."
        }
    }
}
