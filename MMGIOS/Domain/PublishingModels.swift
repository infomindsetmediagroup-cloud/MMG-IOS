import Foundation

enum PublishingAssetType: String, CaseIterable, Codable, Identifiable {
    case book = "Book"
    case digitalProduct = "Digital Product"
    case serviceProduct = "Service Product"
    case article = "Article"
    case onboardingPDF = "Onboarding PDF"
    case shopifyPage = "Shopify Page"

    var id: String { rawValue }
}

enum PublishingAssetStatus: String, CaseIterable, Codable, Identifiable {
    case idea = "Idea"
    case drafted = "Drafted"
    case inProduction = "In Production"
    case qa = "QA"
    case readyToPublish = "Ready to Publish"
    case published = "Published"

    var id: String { rawValue }
}

struct PublishingAsset: Identifiable, Codable, Hashable {
    var id: UUID
    var title: String
    var assetType: PublishingAssetType
    var status: PublishingAssetStatus
    var owner: String
    var canonicalPath: String
    var summary: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        assetType: PublishingAssetType,
        status: PublishingAssetStatus,
        owner: String = "MMG",
        canonicalPath: String,
        summary: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.assetType = assetType
        self.status = status
        self.owner = owner
        self.canonicalPath = canonicalPath
        self.summary = summary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
