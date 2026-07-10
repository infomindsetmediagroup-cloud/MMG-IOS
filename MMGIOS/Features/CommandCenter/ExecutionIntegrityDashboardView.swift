import SwiftData
import SwiftUI

struct ExecutionIntegrityDashboardView: View {
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]

    private var report: ExecutionPackageIntegrityReport {
        ExecutionPackageIntegrityPolicy.report(
            workflows: workflows,
            tasks: tasks,
            queueItems: queueItems
        )
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    integrityHeader
                }
                .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
                .listRowBackground(Color.clear)

                Section("Integrity Snapshot") {
                    metricRow(title: "Complete packages", value: report.completePackageCount, systemImage: "checkmark.seal")
                    metricRow(title: "Integrity issues", value: report.issueCount, systemImage: "exclamationmark.triangle")
                    metricRow(title: "Workflows missing tasks", value: report.workflowsMissingTasks.count, systemImage: "point.3.connected.trianglepath.dotted")
                    metricRow(title: "Tasks missing workflows", value: report.tasksMissingWorkflows.count, systemImage: "checklist")
                    metricRow(title: "Tasks missing queue items", value: report.tasksMissingQueueItems.count, systemImage: "tray")
                    metricRow(title: "Queue items missing tasks", value: report.queueItemsMissingTasks.count, systemImage: "tray.full")
                }

                integritySection(
                    title: "Workflows Missing Tasks",
                    values: report.workflowsMissingTasks,
                    emptyText: "Every workflow has a linked task."
                )

                integritySection(
                    title: "Tasks Missing Workflows",
                    values: report.tasksMissingWorkflows,
                    emptyText: "Every task has a valid workflow link."
                )

                integritySection(
                    title: "Tasks Missing Queue Items",
                    values: report.tasksMissingQueueItems,
                    emptyText: "Every task has a linked production queue item."
                )

                integritySection(
                    title: "Queue Items Missing Tasks",
                    values: report.queueItemsMissingTasks,
                    emptyText: "Every production queue item has a valid task link."
                )

                Section("Kairos Integrity Recommendation") {
                    Label {
                        Text(recommendation)
                            .font(.callout)
                    } icon: {
                        Image(systemName: report.isHealthy ? "checkmark.shield" : "wrench.and.screwdriver")
                            .foregroundStyle(report.isHealthy ? .green : .orange)
                    }
                }
            }
            .navigationTitle("Integrity")
            .scrollContentBackground(.hidden)
            .background(Color.mmgBackground)
        }
    }

    private var integrityHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Execution Integrity")
                    .font(.largeTitle.bold())
                    .foregroundStyle(.mmgInk)
                Spacer()
                Text(report.isHealthy ? "Healthy" : "Attention")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background((report.isHealthy ? Color.green : Color.orange).opacity(0.12))
                    .foregroundStyle(report.isHealthy ? .green : .orange)
                    .clipShape(Capsule())
            }

            Text("Kairos validates that every workflow, task, and production queue record remains connected as one complete execution package.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [.white, .mmgSurface], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke((report.isHealthy ? Color.green : Color.orange).opacity(0.18), lineWidth: 1)
        )
    }

    private var recommendation: String {
        if report.isHealthy {
            return "All execution package links are intact. Continue monitoring package creation and runtime transitions."
        }
        if !report.workflowsMissingTasks.isEmpty {
            return "Repair workflows missing tasks first. A workflow without an executable task cannot enter production."
        }
        if !report.tasksMissingQueueItems.isEmpty {
            return "Create missing queue entries so existing tasks can be scheduled and monitored."
        }
        if !report.tasksMissingWorkflows.isEmpty {
            return "Resolve orphaned tasks by restoring their workflow link or archiving invalid records."
        }
        return "Resolve orphaned queue records by restoring their task link or removing invalid queue entries."
    }

    private func metricRow(title: String, value: Int, systemImage: String) -> some View {
        Label {
            LabeledContent(title, value: "\(value)")
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(.mmgBlue)
        }
    }

    @ViewBuilder
    private func integritySection(title: String, values: [String], emptyText: String) -> some View {
        Section(title) {
            if values.isEmpty {
                Label(emptyText, systemImage: "checkmark.circle")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(values, id: \.self) { value in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(value)
                            .font(.caption.monospaced())
                            .textSelection(.enabled)
                        Text("Broken execution-package link")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                    }
                }
            }
        }
    }
}

#Preview {
    ExecutionIntegrityDashboardView()
        .modelContainer(for: [
            WorkflowRecord.self,
            TaskRecord.self,
            ProductionQueueRecord.self
        ], inMemory: true)
}
