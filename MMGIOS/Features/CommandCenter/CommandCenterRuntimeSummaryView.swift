import SwiftData
import SwiftUI

struct CommandCenterRuntimeSummaryView: View {
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]
    @Query(sort: \ProductionAssetRecord.updatedAt, order: .reverse) private var assets: [ProductionAssetRecord]
    @Query(sort: \DeliverableRecord.updatedAt, order: .reverse) private var deliverables: [DeliverableRecord]
    @Query(sort: \CustomerReleaseRecord.updatedAt, order: .reverse) private var customerReleases: [CustomerReleaseRecord]

    private let releaseGatePolicy = CustomerReleaseGatePolicy()

    private var activeWorkflows: [WorkflowRecord] {
        workflows.filter { $0.status == RuntimeWorkflowStatus.active.rawValue || $0.status == RuntimeWorkflowStatus.draft.rawValue }
    }

    private var approvalWorkflows: [WorkflowRecord] {
        workflows.filter { $0.status == RuntimeWorkflowStatus.waitingForApproval.rawValue }
    }

    private var openTasks: [TaskRecord] {
        tasks.filter { $0.status != ProductionTaskStatus.completed.rawValue && $0.status != ProductionTaskStatus.cancelled.rawValue }
    }

    private var openQueueItems: [ProductionQueueRecord] {
        queueItems.filter { $0.status != ProductionQueueStatus.completed.rawValue }
    }

    private var blockedQueueItems: [ProductionQueueRecord] {
        queueItems.filter { $0.status == ProductionQueueStatus.blocked.rawValue }
    }

    private var reviewAssets: [ProductionAssetRecord] {
        assets.filter { $0.status == ProductionAssetStatus.needsReview.rawValue }
    }

    private var exportReadyAssets: [ProductionAssetRecord] {
        assets.filter { $0.status == ProductionAssetStatus.exportReady.rawValue }
    }

    private var approvedDeliverables: [DeliverableRecord] {
        deliverables.filter { $0.status == DeliverableStatus.approved.rawValue || $0.status == DeliverableStatus.released.rawValue }
    }

    private var draftReleases: [CustomerReleaseRecord] {
        customerReleases.filter { $0.status == CustomerReleaseStatus.draft.rawValue || $0.status == CustomerReleaseStatus.internalReview.rawValue }
    }

    private var publishReadyReleases: [CustomerReleaseRecord] {
        customerReleases.filter { releaseGatePolicy.canPublish($0) && $0.status != CustomerReleaseStatus.published.rawValue }
    }

    private var publishedReleases: [CustomerReleaseRecord] {
        customerReleases.filter { $0.status == CustomerReleaseStatus.published.rawValue }
    }

    private var blockedReleases: [CustomerReleaseRecord] {
        customerReleases.filter { !releaseGatePolicy.canPublish($0) && $0.status != CustomerReleaseStatus.published.rawValue && $0.status != CustomerReleaseStatus.archived.rawValue }
    }

    private var releaseReadinessSummary: String {
        if customerReleases.isEmpty {
            return "No customer releases staged yet."
        }

        if !blockedReleases.isEmpty {
            return "Release gates require attention before customer publication."
        }

        if !publishReadyReleases.isEmpty {
            return "Approved final deliverables are ready for controlled Customer Portal publication."
        }

        if !draftReleases.isEmpty {
            return "Draft and internal-review releases are staged for approval."
        }

        return "Published releases are current; no immediate release blockers detected."
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Workflow Summary") {
                    metricRow(title: "Total workflows", value: workflows.count, systemImage: "point.3.connected.trianglepath.dotted")
                    metricRow(title: "Active workflows", value: activeWorkflows.count, systemImage: "play.circle")
                    metricRow(title: "Waiting approval", value: approvalWorkflows.count, systemImage: "checkmark.seal")
                    metricRow(title: "Open tasks", value: openTasks.count, systemImage: "checklist")
                }

                Section("Queue Metrics") {
                    metricRow(title: "Open queue", value: openQueueItems.count, systemImage: "tray.full")
                    metricRow(title: "Blocked queue", value: blockedQueueItems.count, systemImage: "exclamationmark.triangle")
                    ForEach(ProductionQueueLane.allCases) { lane in
                        let count = queueItems.filter { $0.lane == lane.rawValue && $0.status != ProductionQueueStatus.completed.rawValue }.count
                        metricRow(title: lane.rawValue, value: count, systemImage: "rectangle.stack")
                    }
                }

                Section("Asset Metrics") {
                    metricRow(title: "Production assets", value: assets.count, systemImage: "shippingbox")
                    metricRow(title: "Needs review", value: reviewAssets.count, systemImage: "eye")
                    metricRow(title: "Export ready", value: exportReadyAssets.count, systemImage: "square.and.arrow.up")
                }

                Section("Deliverable Release Metrics") {
                    metricRow(title: "Deliverables", value: deliverables.count, systemImage: "doc.badge.gearshape")
                    metricRow(title: "Approved final assets", value: approvedDeliverables.count, systemImage: "checkmark.seal")
                    metricRow(title: "Draft/internal releases", value: draftReleases.count, systemImage: "lock.doc")
                    metricRow(title: "Publish ready", value: publishReadyReleases.count, systemImage: "paperplane")
                    metricRow(title: "Published to portal", value: publishedReleases.count, systemImage: "person.crop.rectangle.stack")
                    metricRow(title: "Blocked by gates", value: blockedReleases.count, systemImage: "shield.slash")
                }

                Section("Release Gate Operations") {
                    Text(releaseReadinessSummary)
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    if !blockedReleases.isEmpty {
                        ForEach(blockedReleases.prefix(4)) { release in
                            releaseGateRow(release)
                        }
                    } else if !publishReadyReleases.isEmpty {
                        ForEach(publishReadyReleases.prefix(4)) { release in
                            releaseGateRow(release)
                        }
                    } else if !draftReleases.isEmpty {
                        ForEach(draftReleases.prefix(4)) { release in
                            releaseGateRow(release)
                        }
                    }
                }

                Section("Recent Customer Releases") {
                    if customerReleases.isEmpty {
                        Text("No customer releases staged yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(customerReleases.prefix(6)) { release in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(release.title).font(.headline)
                                Text("\(release.status) • \(release.channel) • v\(release.version)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(release.gateSummary.isEmpty ? releaseGatePolicy.evaluate(release).summary : release.gateSummary)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("Recent Queue") {
                    if queueItems.isEmpty {
                        Text("No production queue items yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(queueItems.prefix(8)) { item in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(item.summary).font(.headline)
                                Text("\(item.lane) • \(item.status) • \(item.priority)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Command Runtime")
        }
    }

    private func metricRow(title: String, value: Int, systemImage: String) -> some View {
        Label {
            LabeledContent(title, value: "\(value)")
        } icon: {
            Image(systemName: systemImage)
        }
    }

    private func releaseGateRow(_ release: CustomerReleaseRecord) -> some View {
        let report = releaseGatePolicy.evaluate(release)
        let blockedDetails = report.blockingDetails

        return VStack(alignment: .leading, spacing: 6) {
            Text(release.title)
                .font(.subheadline.bold())
            Text("\(release.status) • \(release.channel) • v\(release.version) • \(report.summary)")
                .font(.caption)
                .foregroundStyle(report.passed ? .secondary : .orange)
            if let firstBlocker = blockedDetails.first {
                Text(firstBlocker)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text("Controlled customer publication gate is clear.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    CommandCenterRuntimeSummaryView()
        .modelContainer(for: [
            WorkflowRecord.self,
            TaskRecord.self,
            ProductionQueueRecord.self,
            ProductionAssetRecord.self,
            DeliverableRecord.self,
            CustomerReleaseRecord.self
        ], inMemory: true)
}
