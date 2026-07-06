import Foundation

// MARK: - Publishing Metadata

public enum BookCategorySource: String, Codable, CaseIterable, Identifiable {
    case amazonKDP
    case internalCatalog
    case websiteCollection
    case knowledgeLibrary

    public var id: String { rawValue }
}

public struct PublishingKeyword: Identifiable, Codable, Hashable {
    public let id: UUID
    public var phrase: String
    public var priority: Int
    public var source: String

    public init(id: UUID = UUID(), phrase: String, priority: Int = 1, source: String = "Manual") {
        self.id = id
        self.phrase = phrase
        self.priority = priority
        self.source = source
    }
}

public struct PublishingCategory: Identifiable, Codable, Hashable {
    public let id: UUID
    public var name: String
    public var source: BookCategorySource
    public var confidence: Double

    public init(id: UUID = UUID(), name: String, source: BookCategorySource, confidence: Double = 1.0) {
        self.id = id
        self.name = name
        self.source = source
        self.confidence = confidence
    }
}

public struct PublishingMetadataProfile: Identifiable, Codable, Hashable {
    public let id: UUID
    public var projectID: UUID
    public var title: String
    public var subtitle: String
    public var authorName: String
    public var description: String
    public var shortDescription: String
    public var keywords: [PublishingKeyword]
    public var categories: [PublishingCategory]
    public var isbn: String?
    public var languageCode: String
    public var publisherName: String
    public var publicationDate: Date?

    public init(
        id: UUID = UUID(),
        projectID: UUID,
        title: String,
        subtitle: String = "",
        authorName: String,
        description: String = "",
        shortDescription: String = "",
        keywords: [PublishingKeyword] = [],
        categories: [PublishingCategory] = [],
        isbn: String? = nil,
        languageCode: String = "en-US",
        publisherName: String = "Mindset Media Group",
        publicationDate: Date? = nil
    ) {
        self.id = id
        self.projectID = projectID
        self.title = title
        self.subtitle = subtitle
        self.authorName = authorName
        self.description = description
        self.shortDescription = shortDescription
        self.keywords = keywords
        self.categories = categories
        self.isbn = isbn
        self.languageCode = languageCode
        self.publisherName = publisherName
        self.publicationDate = publicationDate
    }
}

public enum PublishingMetadataGenerator {
    public static func makeInitialProfile(project: PublishingProject, analysis: ManuscriptAnalysisResult?) -> PublishingMetadataProfile {
        PublishingMetadataProfile(
            projectID: project.id,
            title: project.title,
            subtitle: project.subtitle,
            authorName: project.authorName,
            description: analysis?.productionBrief ?? "",
            shortDescription: project.subtitle,
            keywords: suggestedKeywords(project: project, analysis: analysis),
            categories: suggestedCategories(project: project, analysis: analysis),
            isbn: nil
        )
    }

    private static func suggestedKeywords(project: PublishingProject, analysis: ManuscriptAnalysisResult?) -> [PublishingKeyword] {
        var phrases = ["publishing", "creator education", "business systems"]
        let titleWords = project.title.lowercased().split(separator: " ").map(String.init).filter { $0.count > 3 }
        phrases.append(contentsOf: titleWords)
        if let analysis, analysis.estimatedWordCount < 10_000 {
            phrases.append("short guide")
        }
        return Array(Set(phrases)).sorted().enumerated().map { index, phrase in
            PublishingKeyword(phrase: phrase, priority: index + 1, source: "Kairos")
        }
    }

    private static func suggestedCategories(project: PublishingProject, analysis: ManuscriptAnalysisResult?) -> [PublishingCategory] {
        var categories = [
            PublishingCategory(name: "Business & Money", source: .amazonKDP, confidence: 0.72),
            PublishingCategory(name: "Education & Reference", source: .amazonKDP, confidence: 0.68),
            PublishingCategory(name: "Creator Education", source: .internalCatalog, confidence: 0.95)
        ]

        if project.title.localizedCaseInsensitiveContains("AI") {
            categories.append(PublishingCategory(name: "Computers & Technology", source: .amazonKDP, confidence: 0.82))
        }

        if let analysis, analysis.detectedChapters.contains(where: { $0.title.localizedCaseInsensitiveContains("faith") }) {
            categories.append(PublishingCategory(name: "Christian Living", source: .amazonKDP, confidence: 0.64))
        }

        return categories
    }
}
