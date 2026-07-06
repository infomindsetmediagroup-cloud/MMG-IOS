import SwiftUI

public struct PublishingStudioDashboardView: View {
    @State private var store = PublishingWorkspaceStore.seeded()
    @State private var selectedPreviewMode: PublishingPreviewMode = .paperback

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    projectHeader
                    manuscriptCard
                    previewCard
                    exportCard
                }
                .padding(20)
            }
            .navigationTitle("Publishing Dashboard")
        }
    }

    private var projectHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(store.project.title)
                .font(.largeTitle.bold())
            Text(store.project.subtitle)
                .font(.title3)
                .foregroundStyle(.secondary)
            HStack {
                Label("\(store.project.manuscriptWordCount) words", systemImage: "doc.text")
                Label("\(store.project.estimatedPageCount) pages", systemImage: "book")
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var manuscriptCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Manuscript Intelligence")
                .font(.headline)
            if let analysis = store.manuscriptAnalysis {
                Text(analysis.productionBrief)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                ForEach(analysis.detectedChapters) { chapter in
                    HStack {
                        Image(systemName: "text.book.closed")
                            .foregroundStyle(.blue)
                        Text(chapter.title)
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Text("#\(chapter.order)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                Text("Upload or draft a manuscript to begin analysis.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var previewCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Live Preview")
                    .font(.headline)
                Spacer()
                Picker("Mode", selection: $selectedPreviewMode) {
                    ForEach(PublishingPreviewMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.menu)
            }

            if let document = store.editorDocument {
                let preview = LivePreviewEngine.generatePreview(for: store.project, document: document, mode: selectedPreviewMode)
                ForEach(preview.pages.prefix(3)) { page in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Page \(page.pageNumber): \(page.title)")
                            .font(.subheadline.bold())
                        Text("\(page.blocks.count) blocks • \(page.estimatedWordCount) words")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            } else {
                Text("No editor document available yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var exportCard: some View {
        let plan = PublishingExportPlanner.makePlan(
            project: store.project,
            document: store.editorDocument,
            coverAssembly: store.coverAssemblyResult,
            kinds: [.epub, .printReadyPDF, .paperbackWrapPDF, .productionArchive]
        )

        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Export Pipeline")
                    .font(.headline)
                Spacer()
                Text(plan.state.rawValue.uppercased())
                    .font(.caption.bold())
                    .foregroundStyle(plan.state == .ready ? .green : .red)
            }

            ForEach(plan.deliverableNames, id: \.self) { deliverable in
                Label(deliverable, systemImage: "doc.badge.gearshape")
                    .font(.subheadline)
            }

            if !plan.issues.isEmpty {
                Divider()
                ForEach(plan.issues) { issue in
                    Label(issue.title, systemImage: issue.severity == .blocking ? "xmark.octagon.fill" : "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(issue.severity == .blocking ? .red : .orange)
                }
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

#Preview {
    PublishingStudioDashboardView()
}
