import Foundation
import Observation

@Observable
final class LocalCampaignStore {
    private let storageKey = "kairos.growth.campaigns.v1"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var campaigns: [Campaign] = []

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        load()

        if campaigns.isEmpty {
            campaigns = SampleData.campaigns
            save()
        }
    }

    var activeCampaigns: [Campaign] {
        campaigns.filter { $0.status != .completed }
    }

    var approvalQueue: [Campaign] {
        campaigns.filter { $0.requiresApproval && !$0.canLaunch }
    }

    func add(_ campaign: Campaign) {
        campaigns.insert(campaign, at: 0)
        save()
    }

    func updateStatus(campaignID: UUID, status: CampaignStatus) {
        guard let index = campaigns.firstIndex(where: { $0.id == campaignID }) else { return }
        campaigns[index].status = status
        campaigns[index].updatedAt = Date()
        save()
    }

    func approve(campaignID: UUID, approver: String) {
        guard let index = campaigns.firstIndex(where: { $0.id == campaignID }) else { return }
        campaigns[index].approvedBy = approver
        campaigns[index].status = .approved
        campaigns[index].updatedAt = Date()
        save()
    }

    func togglePromo(campaignID: UUID) {
        guard let index = campaigns.firstIndex(where: { $0.id == campaignID }), campaigns[index].promoCode != nil else { return }
        campaigns[index].promoCode?.isActive.toggle()
        campaigns[index].updatedAt = Date()
        save()
    }

    func save() {
        do {
            let data = try encoder.encode(campaigns)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            assertionFailure("Failed to save campaigns: \(error.localizedDescription)")
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }

        do {
            campaigns = try decoder.decode([Campaign].self, from: data)
        } catch {
            campaigns = []
        }
    }
}
