import Foundation
import SwiftData

enum DesignStudioAuditEventType: String, CaseIterable, Identifiable {
    case projectCreated = "Project Created"
    case assetCreated = "Asset Created"
    case versionCreated = "Version Created"
    case exportQueued = "Export Queued"
    case exportApproved = "Export Approved"
    case exportRejected = "Export Rejected"
    case permissionGranted = "Permission Granted"
    case kairosAction = "Kairos Action"

    var id: String { rawValue }
}

@Model
final class PersistedDesignStudioAuditEvent {
    var relationshipID: String
    var projectRelationshipID: String
    var assetRelationshipID: String
    var exportJobRelationshipID: String
    var eventTypeRawValue: String
    var actor: String
    var summary: String
    var detail: String
    var createdAt: Date

    init(
        relationshipID: String = UUID().uuidString,
        projectRelationshipID: String = "",
        assetRelationshipID: String = "",
        exportJobRelationshipID: String = "",
        eventType: DesignStudioAuditEventType,
        actor: String,
        summary: String,
        detail: String = "",
        createdAt: Date = .now
    ) {
        self.relationshipID = relationshipID
        self.projectRelationshipID = projectRelationshipID
        self.assetRelationshipID = assetRelationshipID
        self.exportJobRelationshipID = exportJobRelationshipID
        self.eventTypeRawValue = eventType.rawValue
        self.actor = actor
        self.summary = summary
        self.detail = detail
        self.createdAt = createdAt
    }

    var eventType: DesignStudioAuditEventType {
        DesignStudioAuditEventType(rawValue: eventTypeRawValue) ?? .kairosAction
    }
}
