import Foundation
import SwiftData

enum DesignStudioExportStatus: String, CaseIterable, Identifiable {
    case queued = "Queued"
    case processing = "Processing"
    case readyForReview = "Ready for Review"
    case released = "Released"
    case failed = "Failed"

    var id: String { rawValue }
}

enum DesignStudioPermissionLevel: String, CaseIterable, Identifiable {
    case owner = "Owner"
    case editor = "Editor"
    case reviewer = "Reviewer"
    case viewer = "Viewer"
    case productionOnly = "Production Only"

    var id: String { rawValue }
}

@Model
final class PersistedDesignStudioVersionRecord {
    var relationshipID: String
    var projectRelationshipID: String
    var assetRelationshipID: String
    var assetTitle: String
    var projectTitle: String
    var versionLabel: String
    var changeSummary: String
    var changedBy: String
    var kairosAssisted: Bool
    var createdAt: Date

    init(
        relationshipID: String = UUID().uuidString,
        projectRelationshipID: String = "",
        assetRelationshipID: String = "",
        assetTitle: String,
        projectTitle: String,
        versionLabel: String,
        changeSummary: String,
        changedBy: String,
        kairosAssisted: Bool = false,
        createdAt: Date = .now
    ) {
        self.relationshipID = relationshipID
        self.projectRelationshipID = projectRelationshipID
        self.assetRelationshipID = assetRelationshipID
        self.assetTitle = assetTitle
        self.projectTitle = projectTitle
        self.versionLabel = versionLabel
        self.changeSummary = changeSummary
        self.changedBy = changedBy
        self.kairosAssisted = kairosAssisted
        self.createdAt = createdAt
    }
}

@Model
final class PersistedDesignStudioExportJob {
    var relationshipID: String
    var projectRelationshipID: String
    var assetRelationshipID: String
    var assetTitle: String
    var projectTitle: String
    var requestedFormat: String
    var destinationPath: String
    var statusRawValue: String
    var requestedBy: String
    var approvalRequired: Bool
    var releaseNotes: String
    var createdAt: Date
    var updatedAt: Date

    init(
        relationshipID: String = UUID().uuidString,
        projectRelationshipID: String = "",
        assetRelationshipID: String = "",
        assetTitle: String,
        projectTitle: String,
        requestedFormat: String,
        destinationPath: String,
        status: DesignStudioExportStatus = .queued,
        requestedBy: String,
        approvalRequired: Bool = true,
        releaseNotes: String = "",
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.relationshipID = relationshipID
        self.projectRelationshipID = projectRelationshipID
        self.assetRelationshipID = assetRelationshipID
        self.assetTitle = assetTitle
        self.projectTitle = projectTitle
        self.requestedFormat = requestedFormat
        self.destinationPath = destinationPath
        self.statusRawValue = status.rawValue
        self.requestedBy = requestedBy
        self.approvalRequired = approvalRequired
        self.releaseNotes = releaseNotes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var status: DesignStudioExportStatus {
        DesignStudioExportStatus(rawValue: statusRawValue) ?? .queued
    }
}

@Model
final class PersistedDesignStudioPermissionRecord {
    var relationshipID: String
    var projectRelationshipID: String
    var customerName: String
    var projectTitle: String
    var principalName: String
    var permissionLevelRawValue: String
    var canExportApprovedDeliverables: Bool
    var canAccessIntermediateAssets: Bool
    var createdAt: Date
    var updatedAt: Date

    init(
        relationshipID: String = UUID().uuidString,
        projectRelationshipID: String = "",
        customerName: String,
        projectTitle: String,
        principalName: String,
        permissionLevel: DesignStudioPermissionLevel,
        canExportApprovedDeliverables: Bool = false,
        canAccessIntermediateAssets: Bool = false,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.relationshipID = relationshipID
        self.projectRelationshipID = projectRelationshipID
        self.customerName = customerName
        self.projectTitle = projectTitle
        self.principalName = principalName
        self.permissionLevelRawValue = permissionLevel.rawValue
        self.canExportApprovedDeliverables = canExportApprovedDeliverables
        self.canAccessIntermediateAssets = canAccessIntermediateAssets
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var permissionLevel: DesignStudioPermissionLevel {
        DesignStudioPermissionLevel(rawValue: permissionLevelRawValue) ?? .viewer
    }
}
