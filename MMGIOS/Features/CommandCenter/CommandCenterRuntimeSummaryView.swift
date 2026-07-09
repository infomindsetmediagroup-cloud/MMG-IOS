import SwiftData
import SwiftUI

struct CommandCenterRuntimeSummaryView: View {
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]

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
}

#Preview {
    CommandCenterRuntimeSummaryView()
        .modelContainer(for: [
            WorkflowRecord.self,
            TaskRecord.self,
            ProductionQueueRecord.self
        ], inMemory: true)
}
