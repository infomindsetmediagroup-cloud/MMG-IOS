import Foundation

final class KairosRuntimeClient {
    enum ClientError: Error, Equatable {
        case missingEndpoint
        case invalidMessage
        case invalidResponse
        case serverError(code: String, message: String)
    }

    private let endpoint: URL?
    private let urlSession: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        endpoint: URL? = KairosRuntimeConfiguration.endpoint,
        urlSession: URLSession = .shared,
        encoder: JSONEncoder = JSONEncoder(),
        decoder: JSONDecoder = JSONDecoder()
    ) {
        self.endpoint = endpoint
        self.urlSession = urlSession
        self.encoder = encoder
        self.decoder = decoder
    }

    func send(_ request: KairosRuntimeRequest) async throws -> KairosRuntimeResponse {
        guard let endpoint else {
            throw ClientError.missingEndpoint
        }

        let trimmedMessage = request.message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedMessage.isEmpty else {
            throw ClientError.invalidMessage
        }

        var normalizedRequest = request
        normalizedRequest.message = trimmedMessage

        var urlRequest = URLRequest(url: endpoint)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        urlRequest.httpBody = try encoder.encode(normalizedRequest)

        let (data, response) = try await urlSession.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200..<300:
            return try decoder.decode(KairosRuntimeResponse.self, from: data)
        default:
            if let errorResponse = try? decoder.decode(KairosRuntimeErrorResponse.self, from: data) {
                throw ClientError.serverError(code: errorResponse.code, message: errorResponse.message)
            }

            throw ClientError.invalidResponse
        }
    }
}
