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
        let data = Data(
            """
            {
              "message": "Runtime online.",
              "department": "engineering",
              "requestId": "request-123",
              "auditId": "audit-456"
            }
            """.utf8
        )

        let response = try JSONDecoder().decode(KairosRuntimeResponse.self, from: data)

        XCTAssertEqual(response.message, "Runtime online.")
        XCTAssertEqual(response.department, "engineering")
        XCTAssertEqual(response.requestID, "request-123")
        XCTAssertEqual(response.auditID, "audit-456")
    }

    func testErrorResponseUsesMessageBeforeErrorCode() throws {
        let data = Data(
            """
            {
              "error": "rate_limited",
              "message": "Kairos is handling too many requests.",
              "requestId": "request-789"
            }
            """.utf8
        )

        let response = try JSONDecoder().decode(KairosRuntimeErrorResponse.self, from: data)

        XCTAssertEqual(response.displayMessage, "Kairos is handling too many requests.")
    }

    func testRuntimeErrorProvidesSafeUserFacingDescriptions() {
        XCTAssertEqual(
            KairosRuntimeError.missingConfiguration.errorDescription,
            "Kairos runtime is not configured."
        )
        XCTAssertEqual(
            KairosRuntimeError.decoding.errorDescription,
            "Kairos returned a response the app could not read."
        )
    }
}
