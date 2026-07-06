import Foundation
import Observation

@Observable
final class LocalCustomerPortalStore {
    private let storageKey = "kairos.customer.portal.requests.v1"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var requests: [CustomerPortalRequest] = []

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        load()

        if requests.isEmpty {
            requests = SampleData.customerRequests
            save()
        }
    }

    var openRequests: [CustomerPortalRequest] {
        requests.filter { $0.status != .complete }
    }

    func add(_ request: CustomerPortalRequest) {
        requests.insert(request, at: 0)
        save()
    }

    func updateStatus(requestID: UUID, status: CustomerRequestStatus) {
        guard let index = requests.firstIndex(where: { $0.id == requestID }) else { return }
        requests[index].status = status
        save()
    }

    func save() {
        do {
            let data = try encoder.encode(requests)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            assertionFailure("Failed to save customer portal requests: \(error.localizedDescription)")
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }

        do {
            requests = try decoder.decode([CustomerPortalRequest].self, from: data)
        } catch {
            requests = []
        }
    }
}
