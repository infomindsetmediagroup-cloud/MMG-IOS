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

    private var highPriorityCount: Int { actionItems.filter { $0.priority == .high }.count }
    private var openActionCount: Int { actionItems.filter { $0.status != .completed }.count }
    private var needsReviewCount: Int { actionItems.filter { $0.status == .needsReview }.count }
    private var inProgressCount: Int { actionItems.filter { $0.status == .inProgress }.count }
    private var completedCount: Int { actionItems.filter { $0.status == .completed }.count }

    private var queueHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Executive Action Queue")
                .font(.largeTitle.bold())
                .foregroundStyle(.mmgInk)

            Text("Review routed Kairos commands, record required approvals, and inspect each generated workflow, task, and production queue entry.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [.white, .mmgSurface], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.mmgBlue.opacity(0.16), lineWidth: 1))
    }

    private func metricRow(title: String, value: Int, systemImage: String) -> some View {
        Label {
            LabeledContent(title, value: "\(value)")
        } icon: {
            Image(systemName: systemImage).foregroundStyle(.mmgBlue)
        }
    }

    @ViewBuilder
    private func actionSectionItems(_ items: [ExecutiveActionItem], emptyText: String) -> some View {
        if items.isEmpty {
            Text(emptyText).foregroundStyle(.secondary)
        } else {
            ForEach(items) { item in
                NavigationLink {
                    ExecutiveActionDetailView(record: item.record)
                } label: {
                    actionRow(item)
                }
            }
        }
    }

    private func actionRow(_ item: ExecutiveActionItem) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.title).font(.headline).lineLimit(2)
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

            Text(item.department).font(.caption.weight(.semibold)).foregroundStyle(.mmgBlue)
            Text(item.summary).font(.caption).foregroundStyle(.secondary).lineLimit(3)
            Text(item.updatedAt.formatted(date: .abbreviated, time: .shortened)).font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

private struct ExecutiveActionDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]
    @Bindable var record: KnowledgeVaultRecord

    private let workflowFactory = ExecutiveWorkflowFactory()
    private let taskRuntime = TaskRuntimeService()
    private let queueRuntime = ProductionQueueService()
    private let approvalPolicy = KairosApprovalPolicy()

    private var item: ExecutiveActionItem { ExecutiveActionItem(record: record) }
    private var linkedWorkflow: WorkflowRecord? { workflows.first { $0.projectID == record.id } }
    private var linkedTask: TaskRecord? {
        guard let workflowID = linkedWorkflow?.id else { return nil }
        return tasks.first { $0.workflowID == workflowID }
    }
    private var linkedQueueItem: ProductionQueueRecord? {
        guard let taskID = linkedTask?.id else { return nil }
        return queueItems.first { $0.taskID == taskID }
    }
    private var approvalRequirement: KairosApprovalRequirement { approvalPolicy.requirement(for: record) }

    var body: some View {
        List {
            Section("Action") {
                LabeledContent("Department", value: item.department)
                LabeledContent("Priority", value: item.priority.label)
                LabeledContent("Status", value: item.status.label)
                LabeledContent("Updated", value: item.updatedAt.formatted(date: .abbreviated, time: .shortened))
            }

            Section("Approval Gate") {
                LabeledContent("Category", value: approvalRequirement.category.rawValue)
                LabeledContent("Required", value: approvalRequirement.isRequired ? "Yes" : "No")
                LabeledContent("Decision", value: approvalRequirement.statusLabel)

                if approvalRequirement.isRequired && !approvalRequirement.isApproved {
                    Button("Approve") { recordApproval(.approved) }
                        .disabled(item.status == .completed)
                    Button("Reject", role: .destructive) { recordApproval(.rejected) }
                        .disabled(item.status == .completed)
                }
            }

            Section("Execution Package") {
                if let linkedWorkflow {
                    executionPackageSummary(workflow: linkedWorkflow)
                } else {
                    Button("Create Execution Package") { createExecutionPackage() }
                        .disabled(!approvalPolicy.canCreateExecutionPackage(for: record) || item.status == .completed)

                    Text(executionGateMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Controls") {
                Button("Move to Monitor") { appendState(.monitor) }
                    .disabled(item.status == .completed)
                Button("Mark Complete") { appendState(.completed) }
                    .disabled(item.status == .completed)
            }

            Section("Next Step") {
                Text(item.status.nextStep).textSelection(.enabled)
            }

            Section("Summary") {
                Text(item.summary).textSelection(.enabled)
            }

            Section("Source Record") {
                Text(item.source).font(.callout.monospaced()).textSelection(.enabled)
            }
        }
        .navigationTitle("Action Detail")
    }

    @ViewBuilder
    private func executionPackageSummary(workflow: WorkflowRecord) -> some View {
        LabeledContent("Workflow", value: workflow.projectTitle)
        LabeledContent("Workflow ID", value: workflow.id)
        LabeledContent("Workflow type", value: workflow.type)
        LabeledContent("Stage", value: workflow.stage)
        LabeledContent("Workflow status", value: workflow.status)
        LabeledContent("Owner", value: workflow.owner)

        if let linkedTask {
            Divider()
            LabeledContent("Task", value: linkedTask.title)
            LabeledContent("Task ID", value: linkedTask.id)
            LabeledContent("Department", value: linkedTask.department)
            LabeledContent("Assignee", value: linkedTask.assignee)
            LabeledContent("Task status", value: linkedTask.status)
            if !linkedTask.blocker.isEmpty {
                LabeledContent("Task blocker", value: linkedTask.blocker)
            }
        } else {
            Label("Task record missing", systemImage: "exclamationmark.triangle")
                .foregroundStyle(.orange)
        }

        if let linkedQueueItem {
            Divider()
            LabeledContent("Queue item", value: linkedQueueItem.summary)
            LabeledContent("Queue ID", value: linkedQueueItem.id)
            LabeledContent("Lane", value: linkedQueueItem.lane)
            LabeledContent("Queue status", value: linkedQueueItem.status)
            LabeledContent("Position", value: "\(linkedQueueItem.position)")
            if !linkedQueueItem.blocker.isEmpty {
                LabeledContent("Queue blocker", value: linkedQueueItem.blocker)
            }
        } else {
            Label("Queue record missing", systemImage: "exclamationmark.triangle")
                .foregroundStyle(.orange)
        }
    }

    private var executionGateMessage: String {
        if approvalRequirement.isRejected {
            return "Execution is blocked because the latest approval decision is rejected."
        }
        if approvalRequirement.isRequired && !approvalRequirement.isApproved {
            return "Record the required \(approvalRequirement.category.rawValue.lowercased()) approval before creating the execution package."
        }
        return "Kairos will create one workflow, its initial task, and a production queue entry."
    }

    private func recordApproval(_ decision: KairosApprovalDecision) {
        appendHistory(approvalPolicy.approvalNote(decision: decision, category: approvalRequirement.category))
        appendState(decision == .approved ? .readyToExecute : .needsReview)
        try? modelContext.save()
    }

    private func createExecutionPackage() {
        guard linkedWorkflow == nil,
              approvalPolicy.canCreateExecutionPackage(for: record)
        else { return }

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
        record.decisionHistory = record.decisionHistory.isEmpty ? note : record.decisionHistory + "\n\n" + note
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
        text.components(separatedBy: .newlines)
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
