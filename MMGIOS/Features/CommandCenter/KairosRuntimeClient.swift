import Foundation

protocol KairosRuntimeServing {
    func send(_ request: KairosRuntimeRequest) async throws -> KairosRuntimeResponse
}

struct KairosRuntimeClient: KairosRuntimeServing {
    private let configuration: KairosRuntimeConfiguration
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        configuration: KairosRuntimeConfiguration,
        session: URLSession = .shared,
        encoder: JSONEncoder = JSONEncoder(),
        decoder: JSONDecoder = JSONDecoder()
    ) {
        self.configuration = configuration
        self.session = session
        self.encoder = encoder
        self.decoder = decoder
    }

    func send(_ request: KairosRuntimeRequest) async throws -> KairosRuntimeResponse {
        var urlRequest = URLRequest(url: configuration.endpointURL)
        urlRequest.httpMethod = "POST"
        urlRequest.timeoutInterval = configuration.timeout
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        urlRequest.httpBody = try encoder.encode(request)

        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch let error as URLError {
            throw KairosRuntimeError.transport(message: transportMessage(for: error))
        } catch {
            throw KairosRuntimeError.transport(message: "Kairos is temporarily unavailable.")
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw KairosRuntimeError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let runtimeError = try? decoder.decode(KairosRuntimeErrorResponse.self, from: data)
            throw KairosRuntimeError.server(
                statusCode: httpResponse.statusCode,
                message: runtimeError?.displayMessage ?? "Kairos returned server error \(httpResponse.statusCode)."
            )
        }

        do {
            return try decoder.decode(KairosRuntimeResponse.self, from: data)
        } catch {
            throw KairosRuntimeError.decoding
        }
    }

    private func transportMessage(for error: URLError) -> String {
        switch error.code {
        case .notConnectedToInternet, .networkConnectionLost:
            return "Kairos is offline. Check the network connection and try again."
        case .timedOut:
            return "Kairos took too long to respond. Try again."
        case .cancelled:
            return "The Kairos request was cancelled."
        default:
            return "Kairos is temporarily unavailable."
        }
    }
}
