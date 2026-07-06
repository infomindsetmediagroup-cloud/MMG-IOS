import Foundation
import Observation

@Observable
final class LocalReleasePackageStore {
    private let storageKey = "kairos.release.packages.v1"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var packages: [ReleasePackage] = []

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        load()

        if packages.isEmpty {
            packages = SampleData.releasePackages
            save()
        }
    }

    var openPackages: [ReleasePackage] {
        packages.filter { $0.status != .shipped }
    }

    func add(_ package: ReleasePackage) {
        packages.insert(package, at: 0)
        save()
    }

    func updateStatus(packageID: UUID, status: ReleasePackageStatus) {
        guard let index = packages.firstIndex(where: { $0.id == packageID }) else { return }
        packages[index].status = status
        packages[index].updatedAt = Date()
        save()
    }

    func save() {
        do {
            let data = try encoder.encode(packages)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            assertionFailure("Failed to save release packages: \(error.localizedDescription)")
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }

        do {
            packages = try decoder.decode([ReleasePackage].self, from: data)
        } catch {
            packages = []
        }
    }
}
