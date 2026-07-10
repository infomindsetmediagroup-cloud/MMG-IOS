import Foundation

struct KairosChatResult: Equatable {
    let objective: String
    let routeDecision: KairosRouteDecision
    let runtimeResponse: KairosRuntimeResponse
}

struct KairosChatService {
    private let router: KairosDepartmentRouter
    private let runtime: any KairosRuntimeServing

    init(
        router: KairosDepartmentRouter = KairosDepartmentRouter(),
        runtime: any KairosRuntimeServing
    ) {
        self.router = router
        self.runtime = runtime
    }

    func execute(_ objective: String) async throws -> KairosChatResult {
        let trimmed = objective.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw KairosChatServiceError.emptyObjective
        }

        let decision = router.route(trimmed)
        let request = KairosRuntimeRequest(objective: trimmed, decision: decision)
        let response = try await runtime.send(request)

        return KairosChatResult(
            objective: trimmed,
            routeDecision: decision,
            runtimeResponse: response
        )
    }
}

enum KairosChatServiceError: Error, Equatable, LocalizedError {
    case emptyObjective

    var errorDescription: String? {
        switch self {
        case .emptyObjective:
            return "Enter an objective for Kairos."
        }
    }
}

struct UnavailableKairosRuntime: KairosRuntimeServing {
    let error: KairosRuntimeError

    func send(_ request: KairosRuntimeRequest) async throws -> KairosRuntimeResponse {
        throw error
    }
}

enum KairosRuntimeAvailability: Equatable {
    case configured(host: String)
    case unavailable(message: String)

    var isReady: Bool {
        switch self {
        case .configured:
            return true
        case .unavailable:
            return false
        }
    }

    var title: String {
        isReady ? "Secure runtime configured" : "Runtime configuration required"
    }

    var detail: String {
        switch self {
        case let .configured(host):
            return "Requests will be sent through \(host)."
        case let .unavailable(message):
            return message
        }
    }
}

struct KairosRuntimeEnvironment {
    let service: any KairosRuntimeServing
    let availability: KairosRuntimeAvailability
}

enum KairosRuntimeFactory {
    static func makeDefault(bundle: Bundle = .main) -> any KairosRuntimeServing {
        makeDefaultEnvironment(bundle: bundle).service
    }

    static func makeDefaultEnvironment(bundle: Bundle = .main) -> KairosRuntimeEnvironment {
        do {
            let configuration = try KairosRuntimeConfiguration.from(bundle: bundle)
            let host = configuration.endpointURL.host ?? "the configured Kairos backend"
            return KairosRuntimeEnvironment(
                service: KairosRuntimeClient(configuration: configuration),
                availability: .configured(host: host)
            )
        } catch let error as KairosRuntimeError {
            return KairosRuntimeEnvironment(
                service: UnavailableKairosRuntime(error: error),
                availability: .unavailable(message: error.errorDescription ?? "Kairos runtime is unavailable.")
            )
        } catch {
            return KairosRuntimeEnvironment(
                service: UnavailableKairosRuntime(error: .missingConfiguration),
                availability: .unavailable(message: "Kairos runtime is not configured.")
            )
        }
    }
}
