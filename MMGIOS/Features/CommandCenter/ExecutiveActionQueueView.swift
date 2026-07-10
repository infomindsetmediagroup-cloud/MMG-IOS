import SwiftData
import SwiftUI

struct ExecutiveActionQueueView: View {
    @Query(sort: \KnowledgeVaultRecord.updatedAt, order: .reverse) private var records: [KnowledgeVaultRecord]

    private var actionItems: [ExecutiveActionItem] {
        records.prefix(20).map { ExecutiveActionItem(record: $0) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    queueHeader
                }
                .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
                .listRowBackground(Color.clear)

                Section("Queue Metrics") {
                    metricRow(title: "Open actions", value: openActionCount, systemImage: "tray.full")
                    metricRow(title: "Needs review", value: needsReviewCount, systemImage: "eye")
                    metricRow(title: "In progress", value: inProgressCount, systemImage: "play.circle")
                    metricRow(title: "Completed", value: completedCount, systemImage: "checkmark.circle")
                    metricRow(title: "High priority", value: highPriorityCount, systemImage: "exclamationmark.triangle")
                }

                Section("Needs Review") {
                    actionSectionItems(actionItems.filter { $0.status == .needsReview }, emptyText: "No routed actions currently require review.")
                }

                Section("In Progress") {
                    actionSectionItems(actionItems.filter { $0.status == .inProgress }, emptyText: "No routed actions are in progress.")
                }

                Section("Ready to Execute") {
                    actionSectionItems(actionItems.filter { $0.status == .readyToExecute }, emptyText: "No routed actions are ready to execute yet.")
                }

                Section("Monitor") {
                    actionSectionItems(actionItems.filter { $0.status == .monitor }, emptyText: "No routed actions are in monitor status.")
                }

                Section("Completed") {
                    actionSectionItems(actionItems.filter { $0.status == .completed }, emptyText: "No routed actions have been completed.")
                }
            }
            .navigationTitle("Actions")
            .scrollContentBackground(.hidden)
            .background(Color.mmgBackground)
        }
    }

    private var highPriorityCount: Int {
        actionItems.filter { $0.priority == .high }.count
    }

    private var openActionCount: Int {
        actionItems.filter { $0.status != .completed }.count
    }

    private var needsReviewCount: Int {
        actionItems.filter { $0.status == .needsReview }.count
    }

    private var inProgressCount: Int {
        actionItems.filter { $0.status == .inProgress }.count
    }

    private var completedCount: Int {
        actionItems.filter { $0.status == .completed }.count
    }

    private var queueHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Executive Action Queue")
                .font(.largeTitle.bold())
                .foregroundStyle(.mmgInk)

            Text("Review routed Kairos commands, approve them, and convert approved actions into workflows, tasks, and production queue entries.")
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
                .stroke(Color.mmgBlue.opacity(0.16), lineWidth: 1)
        )
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
    private func actionSectionItems(_ items: [ExecutiveActionItem], emptyText: String) -> some View {
        if items.isEmpty {
            Text(emptyText)
                .foregroundStyle(.secondary)
        } else {
            ForEach(items) { item in
                actionNavigationLink(item)
            }
        }
    }

    private func actionNavigationLink(_ item: ExecutiveActionItem) -> some View {
        NavigationLink {
            ExecutiveActionDetailView(record: item.record)
        } label: {
            actionRow(item)
        }
    }

    private func actionRow(_ item: ExecutiveActionItem) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.title)
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                VStack(alignment: .trailing, spacing: 5) {
                    Text(item.priority.label)
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(item.priority.tint.opacity(0.12))
                        .foregroundStyle(item.priority.tint)
                        .clipShape(Capsule())
                    Text(item.status.label)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(item.status.tint.opacity(0.12))
                        .foregroundStyle(item.status.tint)
                        .clipShape(Capsule())
                }
            }

            Text(item.department)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.mmgBlue)

            Text(item.summary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)

            Text(item.updatedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

private struct ExecutiveActionDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Bindable var record: KnowledgeVaultRecord

    private let workflowFactory = ExecutiveWorkflowFactory()
    private let taskRuntime = TaskRuntimeService()
    private let queueRuntime = ProductionQueueService()

    private var item: ExecutiveActionItem {
        ExecutiveActionItem(record: record)
    }

    private var linkedWorkflow: WorkflowRecord? {
        workflows.first { $0.projectID == record.id }
    }

    var body: some View {
        List {
            Section("Action") {
                LabeledContent("Department", value: item.department)
                LabeledContent("Priority", value: item.priority.label)
                LabeledContent("Status", value: item.status.label)
                LabeledContent("Updated", value: item.updatedAt.formatted(date: .abbreviated, time: .shortened))
            }

            Section("Execution Package") {
                if let linkedWorkflow {
                    LabeledContent("Workflow", value: linkedWorkflow.projectTitle)
                    LabeledContent("Stage", value: linkedWorkflow.stage)
                    LabeledContent("Status", value: linkedWorkflow.status)
                    LabeledContent("Owner", value: linkedWorkflow.owner)
                    Text("The initial task and production queue entry were generated with this workflow.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Button("Create Execution Package") {
                        createExecutionPackage()
                    }
                    .disabled(item.status == .needsReview || item.status == .completed)

                    Text("Approve the action first. Kairos will create one workflow, its initial task, and a production queue entry.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Controls") {
                Button("Approve for Execution") {
                    appendState(.readyToExecute)
                }
                .disabled(item.status == .completed)

                Button("Start Execution") {
                    appendState(.inProgress)
                }
                .disabled(item.status == .completed)

                Button("Move to Monitor") {
                    appendState(.monitor)
                }
                .disabled(item.status == .completed)

                Button("Mark Complete") {
                    appendState(.completed)
                }
                .disabled(item.status == .completed)
            }

            Section("Next Step") {
                Text(item.status.nextStep)
                    .textSelection(.enabled)
            }

            Section("Summary") {
                Text(item.summary)
                    .textSelection(.enabled)
            }

            Section("Source Record") {
                Text(item.source)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
            }
        }
        .navigationTitle("Action Detail")
    }

    private func createExecutionPackage() {
        guard linkedWorkflow == nil else { return }

        let workflow = workflowFactory.createWorkflow(from: record)
        let task = taskRuntime.createInitialTask(for: workflow)
        let queueItem = queueRuntime.createQueueItem(for: task, workflow: workflow)

        modelContext.insert(workflow)
        modelContext.insert(task)
        modelContext.insert(queueItem)

        appendHistory("Workflow ID: \(workflow.id)")
        appendHistory("Workflow Created: \(workflow.projectTitle)")
        appendHistory("Task ID: \(task.id)")
        appendHistory("Task Created: \(task.title)")
        appendHistory("Queue Item ID: \(queueItem.id)")
        appendHistory("Queue Item Created: \(queueItem.summary)")
        appendState(.inProgress)
        try? modelContext.save()
    }

    private func appendState(_ status: ExecutiveActionState) {
        let timestamp = Date().formatted(date: .abbreviated, time: .shortened)
        appendHistory("Action Status: \(status.label) @ \(timestamp)")
        try? modelContext.save()
    }

    private func appendHistory(_ note: String) {
        if record.decisionHistory.isEmpty {
            record.decisionHistory = note
        } else {
            record.decisionHistory += "\n\n\(note)"
        }
        record.updatedAt = .now
    }
}

private struct ExecutiveActionItem: Identifiable {
    let record: KnowledgeVaultRecord
    let id: String
    let title: String
    let department: String
    let summary: String
    let source: String
    let priority: ExecutiveActionPriority
    let status: ExecutiveActionState
    let updatedAt: Date

    init(record: KnowledgeVaultRecord) {
        self.record = record
        self.id = record.id
        self.department = ExecutiveActionItem.extractValue(prefix: "Department:", from: record.decisionHistory) ?? "Kairos"
        self.title = record.projectContext.isEmpty ? "Review routed Kairos command" : record.projectContext
        self.summary = ExecutiveActionItem.extractValue(prefix: "Summary:", from: record.decisionHistory) ?? record.decisionHistory
        self.source = record.decisionHistory
        self.priority = ExecutiveActionPriority.from(record: record)
        self.status = ExecutiveActionState.from(record: record)
        self.updatedAt = record.updatedAt
    }

    private static func extractValue(prefix: String, from text: String) -> String? {
        text
            .components(separatedBy: .newlines)
            .first { $0.hasPrefix(prefix) }?
            .replacingOccurrences(of: prefix, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

#Preview {
    ExecutiveActionQueueView()
        .modelContainer(for: [
            KnowledgeVaultRecord.self,
            WorkflowRecord.self,
            TaskRecord.self,
            ProductionQueueRecord.self
        ], inMemory: true)
}
