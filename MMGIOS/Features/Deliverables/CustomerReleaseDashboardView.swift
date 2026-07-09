import SwiftData
import SwiftUI

struct CustomerReleaseDashboardView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \DeliverableRecord.updatedAt, order: .reverse) private var deliverables: [DeliverableRecord]
    @Query(sort: \CustomerReleaseRecord.updatedAt, order: .reverse) private var releases: [CustomerReleaseRecord]

    private let releaseService = ReleaseApprovalService()

    private var eligibleDeliverables: [DeliverableRecord] {
        deliverables.filter { releaseService.canCreateRelease(from: $0) }
    }

    private var reviewReleases: [CustomerReleaseRecord] {
        releases.filter { $0.status == CustomerReleaseStatus.internalReview.rawValue }
    }

    private var approvedReleases: [CustomerReleaseRecord] {
        releases.filter { $0.status == CustomerReleaseStatus.approved.rawValue }
    }

    private var publishedReleases: [CustomerReleaseRecord] {
        releases.filter { $0.status == CustomerReleaseStatus.published.rawValue }
    }

    private var blockedDeliverables: [DeliverableRecord] {
        deliverables.filter { !releaseService.canCreateRelease(from: $0) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Customer Release Runtime") {
                    LabeledContent("Eligible deliverables", value: "\(eligibleDeliverables.count)")
                    LabeledContent("Blocked deliverables", value: "\(blockedDeliverables.count)")
                    LabeledContent("In review", value: "\(reviewReleases.count)")
                    LabeledContent("Approved", value: "\(approvedReleases.count)")
                    LabeledContent("Published", value: "\(publishedReleases.count)")
                }

                Section("Release Queue") {
                    if releases.isEmpty {
                        Text("No customer releases yet. Create a release only after a deliverable is approved as a final customer-facing asset.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(releases) { release in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(release.title).font(.headline)
                                Text("\(release.status) • \(release.channel) • v\(release.version)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(release.summary)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text(release.gateSummary)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text(release.releaseLocation)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                if !release.approvedBy.isEmpty {
                                    Text("Approved by \(release.approvedBy)")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section("Blocked From Release") {
                    if blockedDeliverables.isEmpty {
                        Text("No blocked deliverables.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(blockedDeliverables) { deliverable in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(deliverable.title).font(.subheadline)
                                Text("\(deliverable.status) • \(deliverable.releaseScope) • approval: \(deliverable.approvedBy.isEmpty ? "missing" : deliverable.approvedBy)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Customer Releases")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button("Create") { createReleaseFromFirstEligibleDeliverable() }
                    Button("Approve") { approveFirstReviewRelease() }
                    Button("Publish") { publishFirstApprovedRelease() }
                }
            }
        }
    }

    private func createReleaseFromFirstEligibleDeliverable() {
        guard let deliverable = eligibleDeliverables.first,
              releases.contains(where: { $0.deliverableID == deliverable.id && $0.version == deliverable.version }) == false,
              let release = releaseService.createDraftRelease(from: deliverable)
        else { return }

        modelContext.insert(release)
        try? modelContext.save()
    }

    private func approveFirstReviewRelease() {
        guard let release = reviewReleases.first else { return }
        releaseService.approve(
            release,
            approver: "Kairos Runtime",
            notes: "Approved final deliverable cleared for controlled customer portal publication."
        )
        try? modelContext.save()
    }

    private func publishFirstApprovedRelease() {
        guard let release = approvedReleases.first else { return }
        releaseService.publish(release)
        try? modelContext.save()
    }
}

#Preview {
    CustomerReleaseDashboardView()
        .modelContainer(for: [
            DeliverableRecord.self,
            CustomerReleaseRecord.self
        ], inMemory: true)
}
