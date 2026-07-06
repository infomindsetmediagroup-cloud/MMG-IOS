import Foundation
import Observation

// MARK: - Interactive Publishing Workspace State

@MainActor
@Observable
public final class PublishingWorkspaceStore {
    public private(set) var project: PublishingProject
    public private(set) var manuscriptAnalysis: ManuscriptAnalysisResult?
    public private(set) var editorDocument: BookEditorDocument?
    public private(set) var coverAssemblyResult: CoverAssemblyResult?

    public init(project: PublishingProject = .sample) {
        self.project = project
    }

    public func analyzeManuscriptText(_ text: String, sourceType: ManuscriptSourceType = .txt) {
        let result = ManuscriptAnalysisEngine.analyzePlainText(text, sourceType: sourceType)
        manuscriptAnalysis = result
        editorDocument = BookEditorAssembler.makeDocument(from: result, projectID: project.id)

        project.manuscriptWordCount = result.estimatedWordCount
        project.estimatedPageCount = result.estimatedPageCount
        project.currentStage = .manuscriptAnalysis
        project.readiness.manuscript = result.findings.contains { $0.severity == .blocking } ? 35 : 80
        project.validationIssues = mergeValidationIssues(from: result)
        project.updatedAt = .now
    }

    public func validateCover(input: CoverAssemblyInput, specification: PrintCoverSpecification) {
        let result = SmartCoverAssemblyEngine.validate(input: input, specification: specification)
        coverAssemblyResult = result
        project.currentStage = .coverStudio
        project.readiness.cover = result.isExportReady ? 95 : 55
        project.validationIssues = result.issues
        project.updatedAt = .now
    }

    public func advance(to stage: PublishingStage) {
        project.currentStage = stage
        project.updatedAt = .now
    }

    public func enableFormat(_ format: PublishingFormat) {
        guard !project.formats.contains(format) else { return }
        project.formats.append(format)
        project.updatedAt = .now
    }

    public func disableFormat(_ format: PublishingFormat) {
        project.formats.removeAll { $0 == format }
        if project.formats.isEmpty { project.formats = [.digital] }
        project.updatedAt = .now
    }

    private func mergeValidationIssues(from result: ManuscriptAnalysisResult) -> [PublishingValidationIssue] {
        result.findings.map { finding in
            PublishingValidationIssue(
                title: finding.title,
                message: finding.detail,
                severity: finding.severity,
                affectedArea: finding.type.rawValue
            )
        }
    }
}

public extension PublishingWorkspaceStore {
    static func seeded() -> PublishingWorkspaceStore {
        let store = PublishingWorkspaceStore(project: .sample)
        store.analyzeManuscriptText(
            """
            Chapter 1
            The creator economy rewards systems, consistency, and execution.

            Chapter 2
            A publishing workflow must move from idea to approved output without losing context.
            """,
            sourceType: .txt
        )
        store.validateCover(
            input: CoverAssemblyInput(
                frontCoverAssetName: "sample-cover",
                backCoverCopy: "A practical operating system for modern creators who want to publish, scale, and build durable digital assets.",
                authorBio: "Michael King is the founder of Mindset Media Group.",
                isbn: nil
            ),
            specification: PrintCoverSpecification(pageCount: 214)
        )
        return store
    }
}
