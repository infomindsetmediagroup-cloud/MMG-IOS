import Foundation
import SwiftData

@Model
final class PersistedReleaseChecklistRecord {
    @Attribute(.unique) var id: UUID
    var projectID: UUID
    var title: String
    var gatePayload: String
    var releaseNotes: String
    var approvedBy: String?
    var approvedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        projectID: UUID,
        title: String,
        gatePayload: String = "[]",
        releaseNotes: String = "",
        approvedBy: String? = nil,
        approvedAt: Date? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.projectID = projectID
        self.title = title
        self.gatePayload = gatePayload
        self.releaseNotes = releaseNotes
        self.approvedBy = approvedBy
        self.approvedAt = approvedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension PersistedReleaseChecklistRecord {
    convenience init(checklist: ReleaseChecklist) {
        self.init(
            id: checklist.id,
            projectID: checklist.projectID,
            title: checklist.title,
            releaseNotes: checklist.releaseNotes,
            approvedBy: checklist.approvedBy,
            approvedAt: checklist.approvedAt
        )
        updateGates(checklist.gates)
    }

    var decodedGates: [QualityGate] {
        guard let data = gatePayload.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([QualityGate].self, from: data)) ?? []
    }

    var isReleaseReady: Bool {
        decodedGates.filter(\.required).allSatisfy { gate in
            gate.status == .passed || gate.status == .waived
        }
    }

    func updateGates(_ gates: [QualityGate]) {
        let data = try? JSONEncoder().encode(gates)
        gatePayload = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        updatedAt = Date()
    }

    func toggleGate(gateID: UUID) {
        var gates = decodedGates
        guard let index = gates.firstIndex(where: { $0.id == gateID }) else { return }
        let currentStatus = gates[index].status
        gates[index].status = currentStatus == .passed ? .pending : .passed
        updateGates(gates)
    }
}
