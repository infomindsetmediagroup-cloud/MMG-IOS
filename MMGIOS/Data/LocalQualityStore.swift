import Foundation
import Observation

@Observable
final class LocalQualityStore {
    private let storageKey = "kairos.quality.checklists.v1"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var checklists: [ReleaseChecklist] = []

    init(projects: [KairosProject] = SampleData.projects) {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        load()

        if checklists.isEmpty {
            checklists = SampleData.releaseChecklists(for: projects)
            save()
        }
    }

    func checklist(for projectID: UUID) -> ReleaseChecklist? {
        checklists.first { $0.projectID == projectID }
    }

    func toggleGate(checklistID: UUID, gateID: UUID) {
        guard let checklistIndex = checklists.firstIndex(where: { $0.id == checklistID }),
              let gateIndex = checklists[checklistIndex].gates.firstIndex(where: { $0.id == gateID }) else { return }

        let currentStatus = checklists[checklistIndex].gates[gateIndex].status
        checklists[checklistIndex].gates[gateIndex].status = currentStatus == .passed ? .pending : .passed
        save()
    }

    func save() {
        do {
            let data = try encoder.encode(checklists)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            assertionFailure("Failed to save release checklists: \(error.localizedDescription)")
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }

        do {
            checklists = try decoder.decode([ReleaseChecklist].self, from: data)
        } catch {
            checklists = []
        }
    }
}
