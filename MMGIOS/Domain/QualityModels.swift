import Foundation

enum QualityGateStatus: String, CaseIterable, Codable, Identifiable {
    case pending = "Pending"
    case passed = "Passed"
    case failed = "Failed"
    case waived = "Waived"

    var id: String { rawValue }
}

struct QualityGate: Identifiable, Codable, Hashable {
    var id: UUID
    var title: String
    var detail: String
    var status: QualityGateStatus
    var required: Bool

    init(id: UUID = UUID(), title: String, detail: String, status: QualityGateStatus = .pending, required: Bool = true) {
        self.id = id
        self.title = title
        self.detail = detail
        self.status = status
        self.required = required
    }
}

struct ReleaseChecklist: Identifiable, Codable, Hashable {
    var id: UUID
    var projectID: UUID
    var title: String
    var gates: [QualityGate]
    var releaseNotes: String
    var approvedBy: String?
    var approvedAt: Date?

    init(id: UUID = UUID(), projectID: UUID, title: String, gates: [QualityGate], releaseNotes: String = "", approvedBy: String? = nil, approvedAt: Date? = nil) {
        self.id = id
        self.projectID = projectID
        self.title = title
        self.gates = gates
        self.releaseNotes = releaseNotes
        self.approvedBy = approvedBy
        self.approvedAt = approvedAt
    }

    var isReleaseReady: Bool {
        gates.filter(\.required).allSatisfy { $0.status == .passed || $0.status == .waived }
    }
}
