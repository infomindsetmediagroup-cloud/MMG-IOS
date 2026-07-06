import Foundation

enum ReleasePackageStatus: String, CaseIterable, Codable, Identifiable {
    case draft = "Draft"
    case readyForReview = "Ready for Review"
    case approved = "Approved"
    case shipped = "Shipped"

    var id: String { rawValue }
}

struct ReleasePackage: Identifiable, Codable, Hashable {
    var id: UUID
    var title: String
    var status: ReleasePackageStatus
    var relatedProjectID: UUID?
    var relatedAssetID: UUID?
    var summary: String
    var customerImpact: String
    var internalNotes: String
    var validationSummary: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        status: ReleasePackageStatus = .draft,
        relatedProjectID: UUID? = nil,
        relatedAssetID: UUID? = nil,
        summary: String,
        customerImpact: String,
        internalNotes: String,
        validationSummary: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.status = status
        self.relatedProjectID = relatedProjectID
        self.relatedAssetID = relatedAssetID
        self.summary = summary
        self.customerImpact = customerImpact
        self.internalNotes = internalNotes
        self.validationSummary = validationSummary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
