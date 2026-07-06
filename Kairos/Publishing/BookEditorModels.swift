import Foundation

// MARK: - Block-Based Book Editor

public enum BookBlockKind: String, Codable, CaseIterable, Identifiable {
    case heading
    case paragraph
    case image
    case table
    case quote
    case sidebar
    case checklist
    case journalPrompt
    case workbookExercise
    case bibleVerse
    case caption
    case footnote
    case callout
    case divider
    case customComponent

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .heading: return "Heading"
        case .paragraph: return "Paragraph"
        case .image: return "Image"
        case .table: return "Table"
        case .quote: return "Quote"
        case .sidebar: return "Sidebar"
        case .checklist: return "Checklist"
        case .journalPrompt: return "Journal Prompt"
        case .workbookExercise: return "Workbook Exercise"
        case .bibleVerse: return "Bible Verse"
        case .caption: return "Caption"
        case .footnote: return "Footnote"
        case .callout: return "Callout"
        case .divider: return "Divider"
        case .customComponent: return "Custom Component"
        }
    }
}

public struct BookEditorBlock: Identifiable, Codable, Hashable {
    public let id: UUID
    public var kind: BookBlockKind
    public var content: String
    public var order: Int
    public var metadata: [String: String]

    public init(
        id: UUID = UUID(),
        kind: BookBlockKind,
        content: String = "",
        order: Int,
        metadata: [String: String] = [:]
    ) {
        self.id = id
        self.kind = kind
        self.content = content
        self.order = order
        self.metadata = metadata
    }
}

public struct BookEditorSection: Identifiable, Codable, Hashable {
    public let id: UUID
    public var title: String
    public var order: Int
    public var blocks: [BookEditorBlock]

    public init(
        id: UUID = UUID(),
        title: String,
        order: Int,
        blocks: [BookEditorBlock] = []
    ) {
        self.id = id
        self.title = title
        self.order = order
        self.blocks = blocks
    }
}

public struct BookEditorDocument: Identifiable, Codable, Hashable {
    public let id: UUID
    public var projectID: UUID
    public var sections: [BookEditorSection]
    public var lastAutosavedAt: Date?
    public var revisionNumber: Int

    public init(
        id: UUID = UUID(),
        projectID: UUID,
        sections: [BookEditorSection] = [],
        lastAutosavedAt: Date? = nil,
        revisionNumber: Int = 1
    ) {
        self.id = id
        self.projectID = projectID
        self.sections = sections
        self.lastAutosavedAt = lastAutosavedAt
        self.revisionNumber = revisionNumber
    }
}

public enum BookEditorAssembler {
    public static func makeDocument(from analysis: ManuscriptAnalysisResult, projectID: UUID = UUID()) -> BookEditorDocument {
        let sections = analysis.detectedChapters.enumerated().map { index, chapter in
            BookEditorSection(
                title: chapter.title,
                order: index + 1,
                blocks: [
                    BookEditorBlock(kind: .heading, content: chapter.title, order: 1),
                    BookEditorBlock(kind: .paragraph, content: "", order: 2)
                ]
            )
        }

        return BookEditorDocument(
            projectID: projectID,
            sections: sections,
            lastAutosavedAt: .now,
            revisionNumber: 1
        )
    }

    public static func flattenedBlocks(from document: BookEditorDocument) -> [BookEditorBlock] {
        document.sections
            .sorted { $0.order < $1.order }
            .flatMap { $0.blocks.sorted { $0.order < $1.order } }
    }
}
