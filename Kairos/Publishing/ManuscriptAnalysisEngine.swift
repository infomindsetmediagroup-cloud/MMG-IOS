import Foundation

// MARK: - Manuscript Intelligence

public enum ManuscriptSourceType: String, Codable, CaseIterable, Identifiable {
    case docx
    case pdf
    case rtf
    case txt
    case blank
    case importedProject

    public var id: String { rawValue }
}

public enum ManuscriptFindingType: String, Codable, CaseIterable, Identifiable {
    case structure
    case formatting
    case image
    case table
    case metadata
    case productionRisk

    public var id: String { rawValue }
}

public struct ManuscriptFinding: Identifiable, Codable, Hashable {
    public let id: UUID
    public var type: ManuscriptFindingType
    public var title: String
    public var detail: String
    public var severity: PublishingValidationSeverity

    public init(
        id: UUID = UUID(),
        type: ManuscriptFindingType,
        title: String,
        detail: String,
        severity: PublishingValidationSeverity
    ) {
        self.id = id
        self.type = type
        self.title = title
        self.detail = detail
        self.severity = severity
    }
}

public struct ManuscriptChapter: Identifiable, Codable, Hashable {
    public let id: UUID
    public var title: String
    public var order: Int
    public var estimatedWordCount: Int
    public var startsAtLine: Int?

    public init(
        id: UUID = UUID(),
        title: String,
        order: Int,
        estimatedWordCount: Int = 0,
        startsAtLine: Int? = nil
    ) {
        self.id = id
        self.title = title
        self.order = order
        self.estimatedWordCount = estimatedWordCount
        self.startsAtLine = startsAtLine
    }
}

public struct ManuscriptAnalysisResult: Codable, Hashable {
    public var sourceType: ManuscriptSourceType
    public var estimatedWordCount: Int
    public var estimatedPageCount: Int
    public var detectedChapters: [ManuscriptChapter]
    public var findings: [ManuscriptFinding]
    public var productionBrief: String

    public init(
        sourceType: ManuscriptSourceType,
        estimatedWordCount: Int,
        estimatedPageCount: Int,
        detectedChapters: [ManuscriptChapter],
        findings: [ManuscriptFinding],
        productionBrief: String
    ) {
        self.sourceType = sourceType
        self.estimatedWordCount = estimatedWordCount
        self.estimatedPageCount = estimatedPageCount
        self.detectedChapters = detectedChapters
        self.findings = findings
        self.productionBrief = productionBrief
    }
}

public enum ManuscriptAnalysisEngine {
    public static func analyzePlainText(_ text: String, sourceType: ManuscriptSourceType = .txt) -> ManuscriptAnalysisResult {
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let words = normalized.split { $0.isWhitespace || $0.isNewline }
        let wordCount = words.count
        let pageCount = max(1, Int(ceil(Double(wordCount) / 250.0)))
        let chapters = detectChapters(in: normalized)
        let findings = makeFindings(text: normalized, wordCount: wordCount, chapters: chapters)

        return ManuscriptAnalysisResult(
            sourceType: sourceType,
            estimatedWordCount: wordCount,
            estimatedPageCount: pageCount,
            detectedChapters: chapters,
            findings: findings,
            productionBrief: makeProductionBrief(wordCount: wordCount, pageCount: pageCount, chapterCount: chapters.count)
        )
    }

    private static func detectChapters(in text: String) -> [ManuscriptChapter] {
        let lines = text.components(separatedBy: .newlines)
        var chapters: [ManuscriptChapter] = []

        for (index, rawLine) in lines.enumerated() {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            let lowercased = line.lowercased()
            let looksLikeChapter = lowercased.hasPrefix("chapter ") || lowercased.hasPrefix("part ") || lowercased.hasPrefix("section ")
            let isShortHeading = line.count <= 80 && line.count > 0 && line == line.capitalized && chapters.isEmpty

            if looksLikeChapter || isShortHeading {
                chapters.append(
                    ManuscriptChapter(
                        title: line,
                        order: chapters.count + 1,
                        startsAtLine: index + 1
                    )
                )
            }
        }

        if chapters.isEmpty && !text.isEmpty {
            chapters.append(ManuscriptChapter(title: "Manuscript", order: 1, startsAtLine: 1))
        }

        return chapters
    }

    private static func makeFindings(text: String, wordCount: Int, chapters: [ManuscriptChapter]) -> [ManuscriptFinding] {
        var findings: [ManuscriptFinding] = []

        if text.isEmpty {
            findings.append(.init(type: .productionRisk, title: "Manuscript Empty", detail: "Upload or draft manuscript content before publishing analysis can continue.", severity: .blocking))
        }

        if wordCount > 0 && wordCount < 5_000 {
            findings.append(.init(type: .productionRisk, title: "Short Manuscript", detail: "The manuscript is under 5,000 words. Confirm this is intentional for a guide, workbook, journal, or micro-publication.", severity: .warning))
        }

        if chapters.count <= 1 && wordCount > 10_000 {
            findings.append(.init(type: .structure, title: "Chapter Structure Needed", detail: "Long manuscripts should have clear chapter or section headings before formatting.", severity: .warning))
        }

        if text.contains("[image]") || text.contains("{{image}}") {
            findings.append(.init(type: .image, title: "Image Placeholder Detected", detail: "Replace image placeholders with final production assets before export.", severity: .warning))
        }

        return findings
    }

    private static func makeProductionBrief(wordCount: Int, pageCount: Int, chapterCount: Int) -> String {
        "Estimated \(wordCount) words across \(pageCount) pages with \(chapterCount) detected section(s). Continue by validating structure, front matter, back matter, cover requirements, and output format selection."
    }
}
