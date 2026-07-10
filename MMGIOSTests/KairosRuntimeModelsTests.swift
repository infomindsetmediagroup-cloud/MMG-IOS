import XCTest
@testable import MMGIOS

final class KairosRuntimeModelsTests: XCTestCase {
    func testRequestEncodesRoutingContext() throws {
        let decision = KairosRouteDecision(
            department: .engineering,
            confidence: 0.92,
            summary: "Engineering owns runtime wiring.",
            executionPlan: ["Define contract", "Send request"],
            governanceNote: "Keep provider credentials server-side."
        )
        let request = KairosRuntimeRequest(objective: "Connect Executive Chat", decision: decision)

        let data = try JSONEncoder().encode(request)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["objective"] as? String, "Connect Executive Chat")
        XCTAssertEqual(object["department"] as? String, KairosDepartment.engineering.rawValue)
        XCTAssertEqual(object["routingConfidence"] as? Double, 0.92)
        XCTAssertEqual(object["source"] as? String, "ios-executive-chat")
        XCTAssertEqual(object["executionPlan"] as? [String], ["Define contract", "Send request"])
    }

    func testResponseDecodesBackendIdentifiers() throws {
        let data = Data("""
        {"message":"Runtime online.","department":"engineering","requestId":"request-123","auditId":"audit-456"}
        """.utf8)
        let response = try JSONDecoder().decode(KairosRuntimeResponse.self, from: data)
        XCTAssertEqual(response.message, "Runtime online.")
        XCTAssertEqual(response.department, "engineering")
        XCTAssertEqual(response.requestID, "request-123")
        XCTAssertEqual(response.auditID, "audit-456")
    }

    func testErrorResponseUsesNestedMessage() throws {
        let data = Data("""
        {"error":{"code":"rate_limited","message":"Kairos is handling too many requests.","requestID":"request-789"}}
        """.utf8)
        let response = try JSONDecoder().decode(KairosRuntimeErrorResponse.self, from: data)
        XCTAssertEqual(response.displayMessage, "Kairos is handling too many requests.")
    }

    func testConfigurationAcceptsHTTPSWithToken() throws {
        let configuration = try KairosRuntimeConfiguration(
            endpointURL: XCTUnwrap(URL(string: "https://api.mindsetmediagroup.com/api/kairos")),
            accessToken: "gateway-token"
        )
        XCTAssertEqual(configuration.endpointURL.scheme, "https")
        XCTAssertEqual(configuration.accessToken, "gateway-token")
    }

    func testConfigurationAcceptsLocalHTTPForDevelopment() throws {
        let configuration = try KairosRuntimeConfiguration(
            endpointURL: XCTUnwrap(URL(string: "http://localhost:3000/api/kairos")),
            accessToken: "local-token"
        )
        XCTAssertEqual(configuration.endpointURL.host, "localhost")
    }

    func testConfigurationRejectsRemoteHTTP() throws {
        XCTAssertThrowsError(
            try KairosRuntimeConfiguration(
                endpointURL: XCTUnwrap(URL(string: "http://api.mindsetmediagroup.com/api/kairos")),
                accessToken: "gateway-token"
            )
        ) { error in
            XCTAssertEqual(error as? KairosRuntimeError, .insecureConfiguration)
        }
    }

    func testConfigurationRejectsEmptyToken() throws {
        XCTAssertThrowsError(
            try KairosRuntimeConfiguration(
                endpointURL: XCTUnwrap(URL(string: "https://api.mindsetmediagroup.com/api/kairos")),
                accessToken: "   "
            )
        ) { error in
            XCTAssertEqual(error as? KairosRuntimeError, .missingConfiguration)
        }
    }

    func testRuntimeErrorProvidesSafeUserFacingDescriptions() {
        XCTAssertEqual(KairosRuntimeError.missingConfiguration.errorDescription, "Kairos runtime is not configured.")
        XCTAssertEqual(KairosRuntimeError.insecureConfiguration.errorDescription, "Kairos runtime must use HTTPS.")
        XCTAssertEqual(KairosRuntimeError.decoding.errorDescription, "Kairos returned a response the app could not read.")
    }
}
