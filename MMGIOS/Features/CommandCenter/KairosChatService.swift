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

    var readiness: KairosRuntimeReadiness {
        runtime.readiness
    }

    func execute(_ objective: String) async throws -> KairosChatResult {
        let trimmed = objective.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw KairosChatServiceError.emptyObjective
        }

        guard runtime.readiness.isReady else {
            throw KairosChatServiceError.runtimeUnavailable(message: runtime.readiness.statusMessage)
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
    case runtimeUnavailable(message: String)

    var errorDescription: String? {
        switch self {
        case .emptyObjective:
            return "Enter an objective for Kairos."
        case let .runtimeUnavailable(message):
            return message
        }
    }
}

struct UnavailableKairosRuntime: KairosRuntimeServing {
    let error: KairosRuntimeError

    var readiness: KairosRuntimeReadiness {
        .unavailable(message: error.errorDescription ?? "Kairos runtime is unavailable.")
    }

    func send(_ request: KairosRuntimeRequest) async throws -> KairosRuntimeResponse {
        throw error
    }
}

enum KairosRuntimeFactory {
    static func makeDefault(bundle: Bundle = .main) -> any KairosRuntimeServing {
        do {
            let configuration = try KairosRuntimeConfiguration.from(bundle: bundle)
            return KairosRuntimeClient(configuration: configuration)
        } catch let error as KairosRuntimeError {
            return UnavailableKairosRuntime(error: error)
        } catch {
            return UnavailableKairosRuntime(error: .missingConfiguration)
        }
    }
}
