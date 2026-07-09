import Foundation

enum DeliverableStatus: String, CaseIterable, Identifiable {
    case draft = "Draft"
    case assembling = "Assembling"
    case review = "Review"
    case approved = "Approved"
    case released = "Released"

    var id: String { rawValue }
}

enum DeliverableType: String, CaseIterable, Identifiable {
    case manuscript = "Manuscript"
    case coverPackage = "Cover Package"
    case marketingAsset = "Marketing Asset"
    case digitalProduct = "Digital Product"
    case printReadyFile = "Print-Ready File"
    case exportPackage = "Export Package"

    var id: String { rawValue }
}

enum DeliverableReleaseScope: String, CaseIterable, Identifiable {
    case internalOnly = "Internal Only"
    case customerPreview = "Customer Preview"
    case approvedFinal = "Approved Final"

    var id: String { rawValue }
}
