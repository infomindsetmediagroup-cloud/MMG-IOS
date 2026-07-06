import SwiftUI

struct PublishingAssetEditorView: View {
    let publishingStore: LocalPublishingStore
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
                Section("Asset") {
                    TextField("Title", text: $title)
                    TextField("Owner", text: $owner)
                    TextField("Canonical Path", text: $canonicalPath)
                    TextField("Summary", text: $summary, axis: .vertical)
                        .lineLimit(4, reservesSpace: true)
                }

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
            .navigationTitle("New Asset")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveAsset() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !canonicalPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func saveAsset() {
        publishingStore.add(
            PublishingAsset(
                title: title,
                assetType: assetType,
                status: status,
                owner: owner,
                canonicalPath: canonicalPath,
                summary: summary
            )
        )
        dismiss()
    }
}

#Preview {
    PublishingAssetEditorView(publishingStore: LocalPublishingStore())
}
