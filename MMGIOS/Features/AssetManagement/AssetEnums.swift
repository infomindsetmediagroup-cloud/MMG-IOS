import Foundation

enum ProductionAssetType: String, CaseIterable, Identifiable {
    case document = "Document"
    case cover = "Cover"
    case image = "Image"
    case video = "Video"
    case marketing = "Marketing"
    case brand = "Brand"
    case exportPackage = "Export Package"

    var id: String { rawValue }
}

enum ProductionAssetStatus: String, CaseIterable, Identifiable {
    case draft = "Draft"
    case inProduction = "In Production"
    case needsReview = "Needs Review"
    case approved = "Approved"
    case exportReady = "Export Ready"
    case delivered = "Delivered"
    case archived = "Archived"

    var id: String { rawValue }
}

enum ProductionAssetAccessLevel: String, CaseIterable, Identifiable {
    case internalOnly = "Internal Only"
    case customerWorkspace = "Customer Workspace"
    case approvedDeliverable = "Approved Deliverable"

    var id: String { rawValue }
}
