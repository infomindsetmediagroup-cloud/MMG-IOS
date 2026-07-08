import Foundation

enum ProductType: String, Codable, Hashable, Sendable, CaseIterable {
    case digitalDownload
    case physicalBook
    case service
    case membership
    case bundle
    case course
    case futureOffering
}

enum PublicationStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case draft
    case internalReview
    case qaApproved
    case scheduled
    case published
    case archived
}

enum Visibility: String, Codable, Hashable, Sendable, CaseIterable {
    case hidden
    case internalOnly
    case customerOnly
    case publicVisible
    case entitlementRequired
}

enum KnowledgeAssetType: String, Codable, Hashable, Sendable, CaseIterable {
    case article
    case pdf
    case guide
    case template
    case sop
    case checklist
    case worksheet
    case playbook
}

enum DifficultyLevel: String, Codable, Hashable, Sendable, CaseIterable {
    case beginner
    case intermediate
    case advanced
    case expert
}

enum DigitalAssetType: String, Codable, Hashable, Sendable, CaseIterable {
    case pdf
    case epub
    case image
    case video
    case audio
    case zip
    case presentation
    case document
}

enum AssetStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case draft
    case published
    case archived
    case superseded
}

struct Product: KairosDomainEntity {
    let id: UUID
    var version: Int
    var sku: String
    var slug: String
    var title: String
    var subtitle: String?
    var description: String
    var productType: ProductType
    var status: PublicationStatus
    var visibility: Visibility
    var price: Decimal
    var currencyCode: String
    var thumbnailAssetID: UUID?
    var coverAssetID: UUID?
    var categoryIDs: [UUID]
    var collectionIDs: [UUID]
    var requiredEntitlementIDs: [UUID]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct ProductCategory: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var slug: String
    var description: String?
    var parentCategoryID: UUID?
    var displayOrder: Int
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Collection: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var slug: String
    var description: String
    var visibility: Visibility
    var productIDs: [UUID]
    var knowledgeAssetIDs: [UUID]
    var displayOrder: Int
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct KnowledgeAsset: KairosDomainEntity {
    let id: UUID
    var version: Int
    var slug: String
    var title: String
    var description: String
    var assetType: KnowledgeAssetType
    var category: String
    var difficulty: DifficultyLevel
    var readingTimeMinutes: Int
    var tags: [String]
    var publicationStatus: PublicationStatus
    var requiredEntitlementIDs: [UUID]
    var primaryDigitalAssetID: UUID?
    var aiSummary: String?
    var lastReviewDate: Date?
    var qualityScore: Double?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct DigitalAsset: KairosDomainEntity {
    let id: UUID
    var version: Int
    var filename: String
    var assetType: DigitalAssetType
    var mimeType: String
    var fileSizeBytes: Int64
    var storageLocation: String
    var sha256Hash: String
    var thumbnailAssetID: UUID?
    var status: AssetStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct AssetVersion: KairosDomainEntity {
    let id: UUID
    var version: Int
    var assetID: UUID
    var versionLabel: String
    var storageLocation: String
    var sha256Hash: String
    var status: AssetStatus
    var publishedAt: Date?
    var supersededAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct RecommendationLink: KairosDomainEntity {
    let id: UUID
    var version: Int
    var sourceEntityType: String
    var sourceEntityID: UUID
    var targetEntityType: String
    var targetEntityID: UUID
    var reason: String
    var priority: Int
    var isCurated: Bool
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct EntityTag: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var entityType: String
    var entityID: UUID
    var tag: String
    var createdAt: Date
}

enum CatalogValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case duplicateSKU
    case duplicateSlug
    case missingCoverImage
    case missingDownloadableAsset
    case invalidVersionRelationship
    case brokenRecommendation
    case missingEntitlement
    case invalidCollectionReference
}
