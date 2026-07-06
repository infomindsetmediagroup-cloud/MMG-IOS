import SwiftData
import SwiftUI

struct PublishingCommandCenterView: View {
    let publishingStore: LocalPublishingStore

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedPublishingAssetRecord.updatedAt, order: .reverse) private var assets: [PersistedPublishingAssetRecord]
    @State private var showingEditor = false

    private var activeAssets: [PersistedPublishingAssetRecord] {
        assets.filter { $0.statusRawValue != PublishingAssetStatus.published.rawValue }
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                statusSection
                assetsSection
            }
            .navigationTitle("Publishing")
            .toolbar { toolbarContent }
            .sheet(isPresented: $showingEditor) {
                PublishingAssetEditorView()
            }
            .task { seedAssetsIfNeeded() }
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Publishing OS",
                title: "Publishing Command Center",
                bodyText: "Canonical asset control for books, Shopify pages, onboarding PDFs, articles, service products, and editorial production."
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var statusSection: some View {
        Section("Status") {
            LabeledContent("Active assets", value: "\(activeAssets.count)")
            LabeledContent("Total assets", value: "\(assets.count)")
            Label("Canonical asset registry active", systemImage: "books.vertical")
        }
    }

    private var assetsSection: some View {
        Section("Assets") {
            if assets.isEmpty {
                Text("No publishing assets yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(assets) { asset in
                    NavigationLink {
                        PublishingAssetDetailView(asset: asset)
                    } label: {
                        PublishingAssetRow(asset: asset)
                    }
                }
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showingEditor = true
            } label: {
                Label("New Asset", systemImage: "plus")
            }
        }
    }

    private func seedAssetsIfNeeded() {
        guard assets.isEmpty else { return }
        for asset in SampleData.publishingAssets {
            modelContext.insert(PersistedPublishingAssetRecord(asset: asset))
        }
    }
}

private struct PublishingAssetRow: View {
    let asset: PersistedPublishingAssetRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(asset.title)
                .font(.headline)
            Text("\(asset.assetTypeRawValue) • \(asset.statusRawValue)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    PublishingCommandCenterView(publishingStore: LocalPublishingStore())
        .modelContainer(for: PersistedPublishingAssetRecord.self, inMemory: true)
}
