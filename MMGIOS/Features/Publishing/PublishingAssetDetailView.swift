import SwiftUI

struct PublishingAssetDetailView: View {
    let publishingStore: LocalPublishingStore
    let asset: PublishingAsset

    private var currentAsset: PublishingAsset {
        publishingStore.assets.first(where: { $0.id == asset.id }) ?? asset
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(currentAsset.assetType.rawValue.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.mmgBlue)
                        .tracking(1.2)

                    Text(currentAsset.title)
                        .font(.largeTitle.bold())

                    Text(currentAsset.summary)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Asset") {
                LabeledContent("Owner", value: currentAsset.owner)
                LabeledContent("Status", value: currentAsset.status.rawValue)
                LabeledContent("Canonical Path", value: currentAsset.canonicalPath)
            }

            Section("Publishing Status") {
                ForEach(PublishingAssetStatus.allCases) { status in
                    Button {
                        publishingStore.updateStatus(assetID: currentAsset.id, status: status)
                    } label: {
                        HStack {
                            Text(status.rawValue)
                            Spacer()
                            if currentAsset.status == status {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.mmgBlue)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Asset")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        PublishingAssetDetailView(publishingStore: LocalPublishingStore(), asset: SampleData.publishingAssets[0])
    }
}
