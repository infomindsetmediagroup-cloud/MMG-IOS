import Foundation
import SwiftData

@Model
final class PersistedIntelligenceItemRecord {
    @Attribute(.unique) var id: UUID
    var title: String
    var sourceName: String
    var itemTypeRawValue: String
    var statusRawValue: String
    var confidenceRawValue: String
    var summary: String
    var recommendation: String
    var requiresApproval: Bool
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        sourceName: String,
        itemTypeRawValue: String,
        statusRawValue: String,
        confidenceRawValue: String,
        summary: String,
        recommendation: String,
        requiresApproval: Bool = true,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.sourceName = sourceName
        self.itemTypeRawValue = itemTypeRawValue
        self.statusRawValue = statusRawValue
        self.confidenceRawValue = confidenceRawValue
        self.summary = summary
        self.recommendation = recommendation
        self.requiresApproval = requiresApproval
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension PersistedIntelligenceItemRecord {
    convenience init(item: IntelligenceItem) {
        self.init(
            id: item.id,
            title: item.title,
            sourceName: item.sourceName,
            itemTypeRawValue: item.itemType.rawValue,
            statusRawValue: item.status.rawValue,
            confidenceRawValue: item.confidence.rawValue,
            summary: item.summary,
            recommendation: item.recommendation,
            requiresApproval: item.requiresApproval,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        )
    }

    var itemType: IntelligenceItemType {
        IntelligenceItemType(rawValue: itemTypeRawValue) ?? .workflow
    }

    var status: IntelligenceItemStatus {
        IntelligenceItemStatus(rawValue: statusRawValue) ?? .detected
    }

    var confidence: IntelligenceConfidence {
        IntelligenceConfidence(rawValue: confidenceRawValue) ?? .medium
    }

    var isOpen: Bool {
        status == .detected || status == .reviewing || status == .approved
    }

    func setStatus(_ status: IntelligenceItemStatus) {
        statusRawValue = status.rawValue
        updatedAt = Date()
    }
}
