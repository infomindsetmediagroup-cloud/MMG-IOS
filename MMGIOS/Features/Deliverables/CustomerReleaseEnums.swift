import Foundation

enum CustomerReleaseStatus: String, CaseIterable, Identifiable {
    case draft = "Draft"
    case internalReview = "Internal Review"
    case approved = "Approved"
    case published = "Published"
    case archived = "Archived"

    var id: String { rawValue }
}

enum CustomerReleaseChannel: String, CaseIterable, Identifiable {
    case customerPortal = "Customer Portal"
    case privateDownload = "Private Download"
    case printProduction = "Print Production"
    case marketplace = "Marketplace"

    var id: String { rawValue }
}

enum CustomerReleaseGate: String, CaseIterable, Identifiable {
    case productionOnlyAssetCheck = "Production-Only Asset Check"
    case approvalMetadataCheck = "Approval Metadata Check"
    case finalDeliverableScopeCheck = "Final Deliverable Scope Check"
    case customerPublicationCheck = "Customer Publication Check"

    var id: String { rawValue }
}
