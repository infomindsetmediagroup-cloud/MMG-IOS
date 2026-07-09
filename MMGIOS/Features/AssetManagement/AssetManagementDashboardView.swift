import SwiftData
import SwiftUI

struct AssetManagementDashboardView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \ProductionAssetRecord.updatedAt, order: .reverse) private var assets: [ProductionAssetRecord]
    @Query(sort: \DesignStudioProjectRecord.updatedAt, order: .reverse) private var projects: [DesignStudioProjectRecord]

    private let assetService = ProductionAssetService()

    private var reviewAssets: [ProductionAssetRecord] {
        assets.filter { $0.status == ProductionAssetStatus.needsReview.rawValue }
    }

    private var exportReadyAssets: [ProductionAssetRecord] {
        assets.filter { $0.status == ProductionAssetStatus.exportReady.rawValue }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Asset Runtime") {
                    LabeledContent("Production assets", value: "\(assets.count)")
                    LabeledContent("Needs review", value: "\(reviewAssets.count)")
                    LabeledContent("Export ready", value: "\(exportReadyAssets.count)")
                }

                Section("Assets") {
                    if assets.isEmpty {
                        Text("No production assets yet. Generate assets from the active Design Studio project.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(assets) { asset in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(asset.title).font(.headline)
                                Text("\(asset.assetType) • \(asset.status) • v\(asset.version)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(asset.summary)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text(asset.accessLevel)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Assets")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button("Generate") { generateAssetsForLatestProject() }
                    Button("Approve") { approveFirstReviewAsset() }
                    Button("Export") { markFirstApprovedAssetExportReady() }
                }
            }
            .task { seedAssetsIfNeeded() }
        }
    }

    private func seedAssetsIfNeeded() {
        guard assets.isEmpty else { return }
        generateAssetsForLatestProject()
    }

    private func generateAssetsForLatestProject() {
        guard let project = projects.first else { return }
        let generatedAssets = assetService.createInitialAssets(for: project)
        generatedAssets.forEach { modelContext.insert($0) }
        try? modelContext.save()
    }

    private func approveFirstReviewAsset() {
        guard let asset = reviewAssets.first else { return }
        assetService.approve(asset, approver: "Kairos Runtime")
        try? modelContext.save()
    }

    private func markFirstApprovedAssetExportReady() {
        guard let asset = assets.first(where: { $0.status == ProductionAssetStatus.approved.rawValue }) else { return }
        assetService.markExportReady(asset)
        try? modelContext.save()
    }
}

#Preview {
    AssetManagementDashboardView()
        .modelContainer(for: [
            ProductionAssetRecord.self,
            DesignStudioProjectRecord.self
        ], inMemory: true)
}
