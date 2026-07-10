import XCTest
@testable import MMGIOS

final class KairosRuntimeClientTests: XCTestCase {
    override func tearDown() {
        URLProtocolStub.requestHandler = nil
        super.tearDown()
    }

    func testSendBuildsPostRequestAndDecodesResponse() async throws {
        let endpoint = try XCTUnwrap(URL(string: "https://example.com/api/kairos"))
        let configuration = try KairosRuntimeConfiguration(endpointURL: endpoint, timeout: 12)
        let session = makeSession()
        let client = KairosRuntimeClient(configuration: configuration, session: session)
        let request = makeRuntimeRequest()

        URLProtocolStub.requestHandler = { urlRequest in
            XCTAssertEqual(urlRequest.url, endpoint)
            XCTAssertEqual(urlRequest.httpMethod, "POST")
            XCTAssertEqual(urlRequest.timeoutInterval, 12)
            XCTAssertEqual(urlRequest.value(forHTTPHeaderField: "Content-Type"), "application/json")
            XCTAssertEqual(urlRequest.value(forHTTPHeaderField: "Accept"), "application/json")

            let body = try XCTUnwrap(urlRequest.httpBody)
            let decoded = try JSONDecoder().decode(KairosRuntimeRequest.self, from: body)
            XCTAssertEqual(decoded, request)

            let response = HTTPURLResponse(
                url: endpoint,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            let data = Data(
                """
                {
                  "message": "Kairos runtime online.",
                  "department": "engineering",
                  "requestId": "req-1",
                  "auditId": "audit-1"
                }
                """.utf8
            )
            return (response, data)
        }

        let response = try await client.send(request)

        XCTAssertEqual(response.message, "Kairos runtime online.")
        XCTAssertEqual(response.requestID, "req-1")
        XCTAssertEqual(response.auditID, "audit-1")
    }

    func testSendMapsBackendErrorPayload() async throws {
        let endpoint = try XCTUnwrap(URL(string: "https://example.com/api/kairos"))
        let configuration = try KairosRuntimeConfiguration(endpointURL: endpoint)
        let client = KairosRuntimeClient(configuration: configuration, session: makeSession())

        URLProtocolStub.requestHandler = { _ in
            let response = HTTPURLResponse(
                url: endpoint,
                statusCode: 429,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            let data = Data(
                """
                {
                  "error": "rate_limited",
                  "message": "Kairos is handling too many requests.",
                  "requestId": "req-429"
                }
                """.utf8
            )
            return (response, data)
        }

        do {
            _ = try await client.send(makeRuntimeRequest())
            XCTFail("Expected server error")
        } catch let error as KairosRuntimeError {
            XCTAssertEqual(
                error,
                .server(statusCode: 429, message: "Kairos is handling too many requests.")
            )
        }
    }

    func testSendRejectsUnreadableSuccessPayload() async throws {
        let endpoint = try XCTUnwrap(URL(string: "https://example.com/api/kairos"))
        let configuration = try KairosRuntimeConfiguration(endpointURL: endpoint)
        let client = KairosRuntimeClient(configuration: configuration, session: makeSession())

        URLProtocolStub.requestHandler = { _ in
            let response = HTTPURLResponse(
                url: endpoint,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Data("not-json".utf8))
        }

        do {
            _ = try await client.send(makeRuntimeRequest())
            XCTFail("Expected decoding error")
        } catch let error as KairosRuntimeError {
            XCTAssertEqual(error, .decoding)
        }
    }

    private func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        return URLSession(configuration: configuration)
    }

    private func makeRuntimeRequest() -> KairosRuntimeRequest {
        let decision = KairosRouteDecision(
            department: .engineering,
            confidence: 0.92,
            summary: "Engineering owns runtime wiring.",
            executionPlan: ["Define contract", "Send request"],
            governanceNote: "Keep provider credentials server-side."
        )
        return KairosRuntimeRequest(objective: "Connect Executive Chat", decision: decision)
    }
}

private final class URLProtocolStub: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
