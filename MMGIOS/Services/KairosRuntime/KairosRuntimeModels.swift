import Foundation

/// Request payload used by MMG client surfaces when speaking to the Kairos backend gateway.
struct KairosRuntimeRequest: Codable, Equatable {
    enum Mode: String, Codable, CaseIterable {
        case `public`
        case customer
        case admin
    }

    enum Surface: String, Codable, CaseIterable {
        case website
        case dashboard
        case ios
    }

    var mode: Mode
    var surface: Surface
    var message: String
    var context: [String: String]

    init(
        mode: Mode,
        surface: Surface = .ios,
        message: String,
        context: [String: String] = [:]
    ) {
        self.mode = mode
        self.surface = surface
        self.message = message
        self.context = context
    }
}

/// Structured response returned by the Kairos backend gateway.
struct KairosRuntimeResponse: Codable, Equatable {
    var reply: String
    var mode: KairosRuntimeRequest.Mode
    var department: String
    var status: String
}

/// Safe error model for client-side handling. Server internals and provider details must not leak here.
struct KairosRuntimeErrorResponse: Codable, Equatable {
    var status: String
    var code: String
    var message: String
}
