import SwiftUI

struct PublishingCommandCenterView: View {
    let publishingStore: LocalPublishingStore
    @State private var showingEditor = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SectionHeader(
                        eyebrow: "Publishing OS",
                        title: "Publishing Command Center",
                        bodyText: "Canonical asset control for books, Shopify pages, onboarding PDFs, articles, service products, and editorial production."
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section("Status") {
                    LabeledContent("Active assets", value: "\(publishingStore.activeAssets.count)")
                    LabeledContent("Total assets", value: "\(publishingStore.assets.count)")
                    Label("Canonical asset registry active", systemImage: "books.vertical")
                }

                Section("Assets") {
                    ForEach(publishingStore.assets) { asset in
                        NavigationLink {
                            PublishingAssetDetailView(publishingStore: publishingStore, asset: asset)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(asset.title)
                                    .font(.headline)
                                Text("\(asset.assetType.rawValue) • \(asset.status.rawValue)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Publishing")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingEditor = true
                    } label: {
                        Label("New Asset", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingEditor) {
                PublishingAssetEditorView(publishingStore: publishingStore)
            }
        }
    }
}

#Preview {
    PublishingCommandCenterView(publishingStore: LocalPublishingStore())
}
