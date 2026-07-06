import SwiftData
import SwiftUI

struct PublishingAssetDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Bindable var asset: PersistedPublishingAssetRecord

    var body: some View {
        List {
            headerSection
            assetSection
            statusSection
            actionsSection
        }
        .navigationTitle("Asset")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Text(asset.assetTypeRawValue.uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.mmgBlue)
                    .tracking(1.2)

                Text(asset.title)
                    .font(.largeTitle.bold())

                Text(asset.summary)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 8)
        }
    }

    private var assetSection: some View {
        Section("Asset") {
            TextField("Title", text: $asset.title)
            TextField("Owner", text: $asset.owner)
            TextField("Canonical Path", text: $asset.canonicalPath)
            TextField("Summary", text: $asset.summary, axis: .vertical)
                .lineLimit(4, reservesSpace: true)
        }
    }

    private var statusSection: some View {
        Section("Publishing Status") {
            ForEach(PublishingAssetStatus.allCases) { status in
                Button {
                    asset.statusRawValue = status.rawValue
                    asset.updatedAt = Date()
                } label: {
                    PublishingStatusRow(status: status, selectedStatus: asset.statusRawValue)
                }
            }
        }
    }

    private var actionsSection: some View {
        Section("Actions") {
            Button(role: .destructive) {
                modelContext.delete(asset)
            } label: {
                Label("Delete Asset", systemImage: "trash")
            }
        }
    }
}

private struct PublishingStatusRow: View {
    let status: PublishingAssetStatus
    let selectedStatus: String

    var body: some View {
        HStack {
            Text(status.rawValue)
            Spacer()
            if selectedStatus == status.rawValue {
                Image(systemName: "checkmark")
                    .foregroundStyle(.mmgBlue)
            }
        }
    }
}

#Preview {
    let asset = PersistedPublishingAssetRecord(asset: SampleData.publishingAssets[0])
    return NavigationStack {
        PublishingAssetDetailView(asset: asset)
    }
    .modelContainer(for: PersistedPublishingAssetRecord.self, inMemory: true)
}
