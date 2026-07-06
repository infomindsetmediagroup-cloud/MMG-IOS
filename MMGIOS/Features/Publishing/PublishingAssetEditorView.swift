import SwiftData
import SwiftUI

struct PublishingAssetEditorView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var assetType: PublishingAssetType = .shopifyPage
    @State private var status: PublishingAssetStatus = .idea
    @State private var owner = "MMG"
    @State private var canonicalPath = ""
    @State private var summary = ""

    var body: some View {
        NavigationStack {
            Form {
                assetSection
                publishingSection
            }
            .navigationTitle("New Asset")
            .toolbar { toolbarContent }
        }
    }

    private var assetSection: some View {
        Section("Asset") {
            TextField("Title", text: $title)
            TextField("Owner", text: $owner)
            TextField("Canonical Path", text: $canonicalPath)
            TextField("Summary", text: $summary, axis: .vertical)
                .lineLimit(4, reservesSpace: true)
        }
    }

    private var publishingSection: some View {
        Section("Publishing") {
            Picker("Type", selection: $assetType) {
                ForEach(PublishingAssetType.allCases) { type in
                    Text(type.rawValue).tag(type)
                }
            }

            Picker("Status", selection: $status) {
                ForEach(PublishingAssetStatus.allCases) { status in
                    Text(status.rawValue).tag(status)
                }
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { dismiss() }
        }

        ToolbarItem(placement: .confirmationAction) {
            Button("Save") { saveAsset() }
                .disabled(!canSave)
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !canonicalPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func saveAsset() {
        let asset = PublishingAsset(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            assetType: assetType,
            status: status,
            owner: owner.trimmingCharacters(in: .whitespacesAndNewlines),
            canonicalPath: canonicalPath.trimmingCharacters(in: .whitespacesAndNewlines),
            summary: summary.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        modelContext.insert(PersistedPublishingAssetRecord(asset: asset))
        dismiss()
    }
}

#Preview {
    PublishingAssetEditorView()
        .modelContainer(for: PersistedPublishingAssetRecord.self, inMemory: true)
}
