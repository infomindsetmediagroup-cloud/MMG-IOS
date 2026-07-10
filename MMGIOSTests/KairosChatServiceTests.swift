import XCTest
@testable import MMGIOS

final class KairosChatServiceTests: XCTestCase {
    func testExecuteRoutesObjectiveAndReturnsRuntimeResponse() async throws {
        let response = KairosRuntimeResponse(
            message: "Runtime response",
            department: "engineering",
            requestID: "request-1",
            auditID: "audit-1"
        )
        let runtime = RuntimeStub(result: .success(response))
        let service = KairosChatService(runtime: runtime)

        let result = try await service.execute("Build the backend API")

        XCTAssertEqual(result.objective, "Build the backend API")
        XCTAssertEqual(result.routeDecision.department, .engineering)
        XCTAssertEqual(result.runtimeResponse, response)
        XCTAssertEqual(runtime.lastRequest?.objective, "Build the backend API")
        XCTAssertEqual(runtime.lastRequest?.department, KairosDepartment.engineering.rawValue)
    }

    func testExecuteTrimsObjectiveBeforeSending() async throws {
        let runtime = RuntimeStub(result: .success(
            KairosRuntimeResponse(
                message: "Done",
                department: nil,
                requestID: nil,
                auditID: nil
            )
        ))
        let service = KairosChatService(runtime: runtime)

        _ = try await service.execute("  Review the release gate  \n")

        XCTAssertEqual(runtime.lastRequest?.objective, "Review the release gate")
    }

    func testExecuteRejectsEmptyObjectiveWithoutCallingRuntime() async {
        let runtime = RuntimeStub(result: .failure(KairosRuntimeError.invalidResponse))
        let service = KairosChatService(runtime: runtime)

        do {
            _ = try await service.execute("   \n")
            XCTFail("Expected empty-objective error")
        } catch {
            XCTAssertEqual(error as? KairosChatServiceError, .emptyObjective)
            XCTAssertNil(runtime.lastRequest)
        }
    }

    func testExecuteRejectsUnavailableRuntimeWithoutDispatching() async {
        let runtime = RuntimeStub(
            readiness: .unavailable(message: "Kairos runtime is not configured."),
            result: .failure(KairosRuntimeError.missingConfiguration)
        )
        let service = KairosChatService(runtime: runtime)

        do {
            _ = try await service.execute("Create the next slice")
            XCTFail("Expected runtime-unavailable error")
        } catch {
            XCTAssertEqual(
                error as? KairosChatServiceError,
                .runtimeUnavailable(message: "Kairos runtime is not configured.")
            )
            XCTAssertNil(runtime.lastRequest)
        }
    }

    func testExecutePropagatesRuntimeFailure() async {
        let expected = KairosRuntimeError.transport(message: "Offline")
        let runtime = RuntimeStub(result: .failure(expected))
        let service = KairosChatService(runtime: runtime)

        do {
            _ = try await service.execute("Create the next slice")
            XCTFail("Expected runtime failure")
        } catch {
            XCTAssertEqual(error as? KairosRuntimeError, expected)
        }
    }
}

private final class RuntimeStub: KairosRuntimeServing {
    private(set) var lastRequest: KairosRuntimeRequest?
    private let result: Result<KairosRuntimeResponse, Error>
    let readiness: KairosRuntimeReadiness

    init(
        readiness: KairosRuntimeReadiness = .ready,
        result: Result<KairosRuntimeResponse, Error>
    ) {
        self.readiness = readiness
        self.result = result
    }

    func send(_ request: KairosRuntimeRequest) async throws -> KairosRuntimeResponse {
        lastRequest = request
        return try result.get()
    }
}
