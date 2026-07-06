import Foundation

// MARK: - Live Preview Engine

public enum PublishingPreviewMode: String, Codable, CaseIterable, Identifiable {
    case paperback
    case hardcover
    case kindle
    case epub
    case pdf
    case webReader
    case mobileReader

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .paperback: return "Paperback"
        case .hardcover: return "Hardcover"
        case .kindle: return "Kindle"
        case .epub: return "EPUB"
        case .pdf: return "PDF"
        case .webReader: return "Web Reader"
        case .mobileReader: return "Mobile Reader"
        }
    }
}

public struct PreviewPage: Identifiable, Codable, Hashable {
    public let id: UUID
    public var pageNumber: Int
    public var title: String
    public var blocks: [BookEditorBlock]
    public var estimatedWordCount: Int

    public init(
        id: UUID = UUID(),
        pageNumber: Int,
        title: String,
        blocks: [BookEditorBlock],
        estimatedWordCount: Int
    ) {
        self.id = id
        self.pageNumber = pageNumber
        self.title = title
        self.blocks = blocks
        self.estimatedWordCount = estimatedWordCount
    }
}

public struct PublishingPreviewDocument: Identifiable, Codable, Hashable {
    public let id: UUID
    public var mode: PublishingPreviewMode
    public var title: String
    public var pages: [PreviewPage]
    public var generatedAt: Date

    public init(
        id: UUID = UUID(),
        mode: PublishingPreviewMode,
        title: String,
        pages: [PreviewPage],
        generatedAt: Date = .now
    ) {
        self.id = id
        self.mode = mode
        self.title = title
        self.pages = pages
        self.generatedAt = generatedAt
    }
}

public enum LivePreviewEngine {
    public static func generatePreview(
        for project: PublishingProject,
        document: BookEditorDocument,
        mode: PublishingPreviewMode
    ) -> PublishingPreviewDocument {
        let sections = document.sections.sorted { $0.order < $1.order }
        let pages = sections.enumerated().map { index, section in
            let blocks = section.blocks.sorted { $0.order < $1.order }
            return PreviewPage(
                pageNumber: index + 1,
                title: section.title,
                blocks: blocks,
                estimatedWordCount: estimateWords(in: blocks)
            )
        }

        return PublishingPreviewDocument(
            mode: mode,
            title: project.title,
            pages: pages.isEmpty ? [emptyPage] : pages
        )
    }

    private static var emptyPage: PreviewPage {
        PreviewPage(
            pageNumber: 1,
            title: "Empty Preview",
            blocks: [BookEditorBlock(kind: .paragraph, content: "Add manuscript content to generate a live preview.", order: 1)],
            estimatedWordCount: 0
        )
    }

    private static func estimateWords(in blocks: [BookEditorBlock]) -> Int {
        blocks.reduce(0) { partial, block in
            partial + block.content.split { $0.isWhitespace || $0.isNewline }.count
        }
    }
}
