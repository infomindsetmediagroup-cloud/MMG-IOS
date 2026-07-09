import Foundation
import SwiftData

enum DesignStudioProjectType: String, CaseIterable, Identifiable {
    case document = "Document / Book"
    case image = "Image / Visual"
    case video = "Video / Short-Form"
    case website = "Website / Landing Page"
    case brand = "Brand Studio"
    case aiWorkspace = "AI Workspace"

    var id: String { rawValue }
}

enum DesignStudioProjectStatus: String, CaseIterable, Identifiable {
    case draft = "Draft"
    case active = "Active"
    case review = "Review"
    case exportReady = "Export Ready"
    case archived = "Archived"

    var id: String { rawValue }
}

enum DesignStudioAssetType: String, CaseIterable, Identifiable {
    case manuscript = "Manuscript"
    case ebook = "eBook"
    case pdf = "PDF"
    case socialGraphic = "Social Graphic"
    case cover = "Cover"
    case brandAsset = "Brand Asset"
    case videoClip = "Video Clip"
    case landingPage = "Landing Page"
    case template = "Template"

    var id: String { rawValue }
}

enum DesignStudioAssetStatus: String, CaseIterable, Identifiable {
    case uploaded = "Uploaded"
    case generated = "Generated"
    case editing = "Editing"
    case approved = "Approved"
    case exported = "Exported"
    case lockedInHouse = "Locked In-House"

    var id: String { rawValue }
}

@Model
final class PersistedDesignStudioProject {
    var relationshipID: String
    var title: String
    var customerName: String
    var projectTypeRawValue: String
    var statusRawValue: String
    var summary: String
    var brandKitKey: String
    var knowledgeVaultKey: String
    var createdAt: Date
    var updatedAt: Date

    init(
        relationshipID: String = UUID().uuidString,
        title: String,
        customerName: String,
        projectType: DesignStudioProjectType,
        status: DesignStudioProjectStatus = .draft,
        summary: String,
        brandKitKey: String = "",
        knowledgeVaultKey: String = "",
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.relationshipID = relationshipID
        self.title = title
        self.customerName = customerName
        self.projectTypeRawValue = projectType.rawValue
        self.statusRawValue = status.rawValue
        self.summary = summary
        self.brandKitKey = brandKitKey
        self.knowledgeVaultKey = knowledgeVaultKey
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var projectType: DesignStudioProjectType {
        DesignStudioProjectType(rawValue: projectTypeRawValue) ?? .document
    }

    var status: DesignStudioProjectStatus {
        DesignStudioProjectStatus(rawValue: statusRawValue) ?? .draft
    }
}

@Model
final class PersistedDesignStudioAsset {
    var relationshipID: String
    var projectRelationshipID: String
    var title: String
    var projectTitle: String
    var assetTypeRawValue: String
    var statusRawValue: String
    var sourceDescription: String
    var storagePath: String
    var exportFormat: String
    var versionLabel: String
    var kairosHistorySummary: String
    var createdAt: Date
    var updatedAt: Date

    init(
        relationshipID: String = UUID().uuidString,
        projectRelationshipID: String = "",
        title: String,
        projectTitle: String,
        assetType: DesignStudioAssetType,
        status: DesignStudioAssetStatus = .uploaded,
        sourceDescription: String,
        storagePath: String,
        exportFormat: String = "",
        versionLabel: String = "v1",
        kairosHistorySummary: String = "",
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.relationshipID = relationshipID
        self.projectRelationshipID = projectRelationshipID
        self.title = title
        self.projectTitle = projectTitle
        self.assetTypeRawValue = assetType.rawValue
        self.statusRawValue = status.rawValue
        self.sourceDescription = sourceDescription
        self.storagePath = storagePath
        self.exportFormat = exportFormat
        self.versionLabel = versionLabel
        self.kairosHistorySummary = kairosHistorySummary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var assetType: DesignStudioAssetType {
        DesignStudioAssetType(rawValue: assetTypeRawValue) ?? .template
    }

    var status: DesignStudioAssetStatus {
        DesignStudioAssetStatus(rawValue: statusRawValue) ?? .uploaded
    }
}
