import Foundation
import Observation

@Observable
final class LocalPublishingStore {
    private let storageKey = "kairos.publishing.assets.v1"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var assets: [PublishingAsset] = []

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        load()

        if assets.isEmpty {
            assets = SampleData.publishingAssets
            save()
        }
    }

    var activeAssets: [PublishingAsset] {
        assets.filter { $0.status != .published }
    }

    func assets(of type: PublishingAssetType) -> [PublishingAsset] {
        assets.filter { $0.assetType == type }
    }

    func add(_ asset: PublishingAsset) {
        assets.insert(asset, at: 0)
        save()
    }

    func updateStatus(assetID: UUID, status: PublishingAssetStatus) {
        guard let index = assets.firstIndex(where: { $0.id == assetID }) else { return }
        assets[index].status = status
        assets[index].updatedAt = Date()
        save()
    }

    func save() {
        do {
            let data = try encoder.encode(assets)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            assertionFailure("Failed to save publishing assets: \(error.localizedDescription)")
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }

        do {
            assets = try decoder.decode([PublishingAsset].self, from: data)
        } catch {
            assets = []
        }
    }
}
