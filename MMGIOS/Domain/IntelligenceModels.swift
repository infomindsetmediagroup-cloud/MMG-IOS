import Foundation

enum IntelligenceItemType: String, CaseIterable, Codable, Identifiable {
    case workflow = "Workflow"
    case quality = "Quality"
    case growth = "Growth"
    case release = "Release"
    case customer = "Customer"
    case system = "System"

    var id: String { rawValue }
}

enum IntelligenceItemStatus: String, CaseIterable, Codable, Identifiable {
    case detected = "Detected"
    case reviewing = "Reviewing"
    case approved = "Approved"
    case completed = "Completed"
    case dismissed = "Dismissed"

    var id: String { rawValue }
}

enum IntelligenceConfidence: String, CaseIterable, Codable, Identifiable {
    case low = "Low"
    case medium = "Medium"
    case high = "High"

    var id: String { rawValue }
}

struct IntelligenceItem: Identifiable, Codable, Hashable {
    var id: UUID
    var title: String
    var sourceName: String
    var itemType: IntelligenceItemType
    var status: IntelligenceItemStatus
    var confidence: IntelligenceConfidence
    var summary: String
    var recommendation: String
    var requiresApproval: Bool
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        sourceName: String,
        itemType: IntelligenceItemType,
        status: IntelligenceItemStatus = .detected,
        confidence: IntelligenceConfidence = .medium,
        summary: String,
        recommendation: String,
        requiresApproval: Bool = true,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.sourceName = sourceName
        self.itemType = itemType
        self.status = status
        self.confidence = confidence
        self.summary = summary
        self.recommendation = recommendation
        self.requiresApproval = requiresApproval
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var isOpen: Bool {
        status == .detected || status == .reviewing || status == .approved
    }
}
