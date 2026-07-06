import Foundation

// MARK: - Contextual Publishing Knowledge

public enum PublishingKnowledgeTopic: String, Codable, CaseIterable, Identifiable {
    case isbn
    case copyright
    case trimSize
    case paperbackWrap
    case metadata
    case categories
    case keywords
    case coverResolution
    case interiorFormatting
    case approvalWorkflow

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .isbn: return "ISBN"
        case .copyright: return "Copyright"
        case .trimSize: return "Trim Size"
        case .paperbackWrap: return "Paperback Wrap"
        case .metadata: return "Metadata"
        case .categories: return "Categories"
        case .keywords: return "Keywords"
        case .coverResolution: return "Cover Resolution"
        case .interiorFormatting: return "Interior Formatting"
        case .approvalWorkflow: return "Approval Workflow"
        }
    }
}

public struct PublishingKnowledgeCard: Identifiable, Codable, Hashable {
    public let id: UUID
    public var topic: PublishingKnowledgeTopic
    public var question: String
    public var answer: String
    public var relatedTopics: [PublishingKnowledgeTopic]

    public init(
        id: UUID = UUID(),
        topic: PublishingKnowledgeTopic,
        question: String,
        answer: String,
        relatedTopics: [PublishingKnowledgeTopic] = []
    ) {
        self.id = id
        self.topic = topic
        self.question = question
        self.answer = answer
        self.relatedTopics = relatedTopics
    }
}

public enum PublishingKnowledgeLibrarySeed {
    public static let cards: [PublishingKnowledgeCard] = [
        PublishingKnowledgeCard(
            topic: .isbn,
            question: "When does this project need an ISBN?",
            answer: "Paperback and hardcover outputs require an ISBN or a confirmed barcode strategy before final print export. Digital outputs can remain in preparation while the identifier decision is pending.",
            relatedTopics: [.metadata, .paperbackWrap]
        ),
        PublishingKnowledgeCard(
            topic: .trimSize,
            question: "Why does trim size matter?",
            answer: "Trim size controls the final physical dimensions of the book and directly affects interior layout, page count, cover wrap dimensions, and spine width.",
            relatedTopics: [.interiorFormatting, .paperbackWrap]
        ),
        PublishingKnowledgeCard(
            topic: .paperbackWrap,
            question: "Why is paperback wrap generation gated?",
            answer: "A full wrap can only be accurate after page count, paper type, trim size, bleed, safe areas, and barcode placement are known and validated.",
            relatedTopics: [.isbn, .trimSize, .coverResolution]
        ),
        PublishingKnowledgeCard(
            topic: .metadata,
            question: "What metadata is required before publishing?",
            answer: "Title, author name, description, categories, keywords, language, publisher, and format-specific identifiers should be complete before approval.",
            relatedTopics: [.categories, .keywords, .isbn]
        ),
        PublishingKnowledgeCard(
            topic: .approvalWorkflow,
            question: "Why is human approval required?",
            answer: "Kairos can prepare production packages automatically, but public publication and deployment remain gated by human approval to prevent unintended releases.",
            relatedTopics: [.metadata, .paperbackWrap]
        )
    ]

    public static func cards(for topic: PublishingKnowledgeTopic) -> [PublishingKnowledgeCard] {
        cards.filter { $0.topic == topic || $0.relatedTopics.contains(topic) }
    }
}
