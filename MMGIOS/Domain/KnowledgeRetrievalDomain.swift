import Foundation

enum KnowledgeDocumentType: String, Codable, Hashable, Sendable, CaseIterable {
    case article
    case sop
    case policy
    case documentation
    case faq
    case template
    case workflowDefinition
    case executiveDirective
    case customerOwnedKnowledge
}

enum SearchIndexType: String, Codable, Hashable, Sendable, CaseIterable {
    case semantic
    case keyword
    case hybrid
    case fullText
    case metadata
    case relationship
}

enum SearchQueryType: String, Codable, Hashable, Sendable, CaseIterable {
    case semantic
    case keyword
    case hybrid
    case filtered
    case relationship
    case entity
    case fullText
    case metadata
}

enum MatchType: String, Codable, Hashable, Sendable, CaseIterable {
    case semantic
    case keyword
    case exact
    case metadata
    case relationship
    case reranked
}

enum IndexStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case pending
    case indexing
    case current
    case stale
    case failed
    case archived
}

struct KnowledgeDocument: KairosDomainEntity {
    let id: UUID
    var version: Int
    var title: String
    var description: String
    var documentType: KnowledgeDocumentType
    var category: String
    var status: PublicationStatus
    var languageCode: String
    var ownerDepartment: String
    var requiredEntitlementIDs: [UUID]
    var authorityScore: Double
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct KnowledgeChunk: KairosDomainEntity {
    let id: UUID
    var version: Int
    var knowledgeDocumentID: UUID
    var sequence: Int
    var content: String
    var characterCount: Int
    var tokenCount: Int
    var embeddingVersion: String?
    var checksum: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct SearchIndex: KairosDomainEntity {
    let id: UUID
    var version: Int
    var indexType: SearchIndexType
    var status: IndexStatus
    var lastIndexedAt: Date?
    var embeddingModel: String?
    var schemaVersion: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct SearchQuery: KairosDomainEntity {
    let id: UUID
    var version: Int
    var customerID: UUID?
    var queryText: String
    var queryType: SearchQueryType
    var requestedAt: Date
    var searchScope: String
    var filters: [String: String]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct SearchResult: KairosDomainEntity {
    let id: UUID
    var version: Int
    var queryID: UUID
    var chunkID: UUID
    var score: Double
    var ranking: Int
    var matchType: MatchType
    var citationReference: UUID?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Citation: KairosDomainEntity {
    let id: UUID
    var version: Int
    var knowledgeDocumentID: UUID
    var chunkID: UUID
    var referenceText: String
    var documentVersion: Int
    var generatedAt: Date
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct RetrievalSession: KairosDomainEntity {
    let id: UUID
    var version: Int
    var departmentExecutionID: UUID?
    var searchQueryID: UUID
    var retrievedChunkIDs: [UUID]
    var totalCandidates: Int
    var finalSelectionIDs: [UUID]
    var confidence: Double
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct EmbeddingMetadata: KairosDomainEntity {
    let id: UUID
    var version: Int
    var chunkID: UUID
    var embeddingVersion: String
    var modelVersion: String
    var generatedAt: Date
    var regenerationStatus: IndexStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct KnowledgeRelationship: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var sourceDocumentID: UUID
    var targetDocumentID: UUID
    var relationshipType: String
    var strength: Double
    var createdAt: Date
}

enum KnowledgeRetrievalValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case missingEmbeddings
    case corruptChunks
    case invalidDocumentVersion
    case duplicateChunkSequence
    case brokenCitation
    case unauthorizedRetrieval
    case outdatedIndex
}
