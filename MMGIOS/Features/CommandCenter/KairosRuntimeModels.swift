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

struct KairosRuntimeErrorResponse: Codable, Equatable {
    let error: String?
    let message: String?
    let requestID: String?

    enum CodingKeys: String, CodingKey {
        case error
        case message
        case requestID = "requestId"
    }

    var displayMessage: String {
        message ?? error ?? "Kairos could not complete the request."
    }
}

struct KairosRuntimeConfiguration: Equatable {
    static let endpointInfoKey = "KAIROS_RUNTIME_URL"

    let endpointURL: URL
    let timeout: TimeInterval

    init(endpointURL: URL, timeout: TimeInterval = 30) {
        self.endpointURL = endpointURL
        self.timeout = timeout
    }

    static func from(bundle: Bundle = .main) throws -> KairosRuntimeConfiguration {
        guard let value = bundle.object(forInfoDictionaryKey: endpointInfoKey) as? String,
              let endpointURL = URL(string: value),
              let scheme = endpointURL.scheme?.lowercased(),
              scheme == "https" || scheme == "http"
        else {
            throw KairosRuntimeError.missingConfiguration
        }

        return KairosRuntimeConfiguration(endpointURL: endpointURL)
    }
}

enum KairosRuntimeError: Error, Equatable, LocalizedError {
    case missingConfiguration
    case invalidResponse
    case server(statusCode: Int, message: String)
    case transport(message: String)
    case decoding

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Kairos runtime is not configured."
        case .invalidResponse:
            return "Kairos returned an invalid response."
        case let .server(_, message):
            return message
        case let .transport(message):
            return message
        case .decoding:
            return "Kairos returned a response the app could not read."
        }
    }
}
