import SwiftData
import SwiftUI

struct DeliverablesDashboardView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \DeliverableRecord.updatedAt, order: .reverse) private var deliverables: [DeliverableRecord]
    @Query(sort: \ProductionAssetRecord.updatedAt, order: .reverse) private var assets: [ProductionAssetRecord]

    private let deliverableService = DeliverableService()

    private var reviewDeliverables: [DeliverableRecord] {
        deliverables.filter { $0.status == DeliverableStatus.review.rawValue }
    }

    private var approvedDeliverables: [DeliverableRecord] {
        deliverables.filter { $0.status == DeliverableStatus.approved.rawValue }
    }

    private var releasedDeliverables: [DeliverableRecord] {
        deliverables.filter { $0.status == DeliverableStatus.released.rawValue }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Deliverable Runtime") {
                    LabeledContent("Deliverables", value: "\(deliverables.count)")
                    LabeledContent("In review", value: "\(reviewDeliverables.count)")
                    LabeledContent("Approved", value: "\(approvedDeliverables.count)")
                    LabeledContent("Released", value: "\(releasedDeliverables.count)")
                }

                Section("Release Control") {
                    if deliverables.isEmpty {
                        Text("No deliverables yet. Assemble deliverables from approved production assets.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(deliverables) { deliverable in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(deliverable.title).font(.headline)
                                Text("\(deliverable.deliverableType) • \(deliverable.status) • v\(deliverable.version)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(deliverable.summary)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text(deliverable.releaseScope)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Deliverables")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button("Assemble") { assembleDeliverablesForLatestAsset() }
                    Button("Approve") { approveFirstReviewDeliverable() }
                    Button("Release") { releaseFirstApprovedDeliverable() }
                }
            }
            .task { seedDeliverablesIfNeeded() }
        }
    }

    private func seedDeliverablesIfNeeded() {
        guard deliverables.isEmpty else { return }
        assembleDeliverablesForLatestAsset()
    }

    private func assembleDeliverablesForLatestAsset() {
        guard let asset = assets.first else { return }
        let generatedDeliverables = deliverableService.createInitialDeliverables(from: asset)
        generatedDeliverables.forEach { modelContext.insert($0) }
        try? modelContext.save()
    }

    private func approveFirstReviewDeliverable() {
        guard let deliverable = reviewDeliverables.first else { return }
        deliverableService.approve(deliverable, approver: "Kairos Runtime")
        try? modelContext.save()
    }

    private func releaseFirstApprovedDeliverable() {
        guard let deliverable = approvedDeliverables.first else { return }
        deliverableService.release(deliverable)
        try? modelContext.save()
    }
}

#Preview {
    DeliverablesDashboardView()
        .modelContainer(for: [
            DeliverableRecord.self,
            ProductionAssetRecord.self
        ], inMemory: true)
}
