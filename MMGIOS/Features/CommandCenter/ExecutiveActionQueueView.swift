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

                Section("Ready for Approval") {
                    actionSectionItems(actionItems.filter { $0.status == .needsReview }, emptyText: "Nothing is waiting for your approval.")
                }

                Section("Queued") {
                    actionSectionItems(actionItems.filter { $0.status == .readyToExecute }, emptyText: "No approved work is waiting to start.")
                }

                Section("Working") {
                    actionSectionItems(actionItems.filter { $0.status == .inProgress }, emptyText: "Kairos has no active work in this center.")
                }

                Section("Completed") {
                    actionSectionItems(actionItems.filter { $0.status == .completed }, emptyText: "Completed work will appear here with its finish time.")
                }
            }
            .navigationTitle("Actions")
            .scrollContentBackground(.hidden)
            .background(Color.mmgBackground)
        }
    }

    private var queueHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Executive Action Queue")
                .font(.largeTitle.bold())
                .foregroundStyle(.mmgInk)

            Text("See what needs your approval, what Kairos is working on, and what has been completed and preserved.")
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
    @State private var blockReason = ""
    @State private var executionError: String?

    private let approvalPolicy = KairosApprovalPolicy()
    private let packageRuntime = ExecutionPackageRuntimeService()
    private let executionCoordinator = ExecutiveExecutionCoordinator()

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
    private var hasCompletePackage: Bool { linkedWorkflow != nil && linkedTask != nil && linkedQueueItem != nil }
    private var isPackageBlocked: Bool {
        linkedTask?.status == ProductionTaskStatus.blocked.rawValue ||
        linkedQueueItem?.status == ProductionQueueStatus.blocked.rawValue
    }
    private var isPackageCompleted: Bool {
        linkedTask?.status == ProductionTaskStatus.completed.rawValue &&
        linkedQueueItem?.status == ProductionQueueStatus.completed.rawValue
    }

    var body: some View {
        List {
            Section("Action") {
                LabeledContent("Department", value: item.department)
                LabeledContent("Priority", value: item.priority.label)
                LabeledContent("Status", value: item.status.label)
                LabeledContent("Updated", value: item.updatedAt.formatted(date: .abbreviated, time: .shortened))
            }

            Section("Decision") {
                if item.status == .needsReview || (item.status == .readyToExecute && linkedWorkflow == nil) {
                    Button("Approve & Execute") { approveAndExecute() }
                        .buttonStyle(.borderedProminent)
                        .tint(.mmgBlue)
                        .disabled(item.status == .completed || isPackageBlocked)

                    Button("Reject", role: .destructive) { recordApproval(.rejected) }
                        .disabled(item.status == .completed)

                    Text("One approval authorizes Kairos to create and queue this action. A connected execution adapter will move it to Working; you will only be asked again if the scope changes or execution is blocked.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if item.status == .readyToExecute {
                    Label("Approved and queued", systemImage: "clock.badge.checkmark")
                        .foregroundStyle(.mmgBlue)
                    Text("Kairos will move this action to Working when an authorized execution adapter claims it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if item.status == .inProgress {
                    Label("Kairos is working", systemImage: "bolt.fill")
                        .foregroundStyle(.mmgBlue)
                    if let linkedWorkflow {
                        ProgressView(value: Double(linkedWorkflow.progress), total: 100)
                            .tint(.mmgBlue)
                        Text("\(linkedWorkflow.progress)% • \(linkedWorkflow.stage)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else if item.status == .completed {
                    Label("Completed and preserved", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }

                if let executionError {
                    Text(executionError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            Section("Summary") {
                Text(item.summary).textSelection(.enabled)
            }

            DisclosureGroup("Technical details") {
                if let linkedWorkflow {
                    executionPackageSummary(workflow: linkedWorkflow)
                }

                if hasCompletePackage {
                    TextField("Block reason", text: $blockReason, axis: .vertical)
                        .lineLimit(1...3)

                    Button("Block Package", role: .destructive) { blockPackage() }
                        .disabled(isPackageCompleted || blockReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    Button("Retry Package") { retryPackage() }
                        .disabled(!isPackageBlocked || isPackageCompleted)

                    Button("Complete Package") { completePackage() }
                        .disabled(isPackageCompleted)
                }

                Button("Move to Monitor") { appendState(.monitor) }
                    .disabled(item.status == .completed)
                Button("Mark Action Complete") { appendState(.completed) }
                    .disabled(item.status == .completed || (hasCompletePackage && !isPackageCompleted))
                Text(item.source).font(.caption.monospaced()).textSelection(.enabled)
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

    private func recordApproval(_ decision: KairosApprovalDecision) {
        appendHistory(approvalPolicy.approvalNote(decision: decision, category: approvalRequirement.category))
        appendState(decision == .approved ? .readyToExecute : .needsReview)
        try? modelContext.save()
    }

    private func approveAndExecute() {
        executionError = nil
        if linkedWorkflow == nil {
            let package = executionCoordinator.approveAndQueue(record: record)
            modelContext.insert(package.workflow)
            modelContext.insert(package.task)
            modelContext.insert(package.queueItem)
        } else if !approvalRequirement.isApproved {
            appendHistory(approvalPolicy.approvalNote(decision: .approved, category: approvalRequirement.category))
            appendState(.readyToExecute)
        }
        do {
            try modelContext.save()
        } catch {
            modelContext.rollback()
            executionError = "Kairos could not queue this action. No partial execution was saved."
        }
    }

    private func blockPackage() {
        guard let workflow = linkedWorkflow,
              let task = linkedTask,
              let queueItem = linkedQueueItem
        else { return }

        let reason = blockReason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !reason.isEmpty else { return }

        packageRuntime.block(workflow: workflow, task: task, queueItem: queueItem, reason: reason)
        appendHistory("Execution Package Blocked: \(reason)")
        appendState(.needsReview)
        blockReason = ""
        try? modelContext.save()
    }

    private func retryPackage() {
        guard let workflow = linkedWorkflow,
              let task = linkedTask,
              let queueItem = linkedQueueItem
        else { return }

        packageRuntime.retry(workflow: workflow, task: task, queueItem: queueItem)
        appendHistory("Execution Package Retried")
        appendState(.readyToExecute)
        try? modelContext.save()
    }

    private func completePackage() {
        guard let workflow = linkedWorkflow,
              let task = linkedTask,
              let queueItem = linkedQueueItem
        else { return }

        let transitions = packageRuntime.complete(workflow: workflow, task: task, queueItem: queueItem)
        transitions.forEach(modelContext.insert)
        appendHistory("Execution Package Completed: \(transitions.count) workflow transitions recorded")
        appendState(.completed)
        try? modelContext.save()
    }

    private func appendState(_ status: ExecutiveActionState) {
        let timestamp = Date().formatted(date: .abbreviated, time: .shortened)
        appendHistory("Action Status: \(status.label) @ \(timestamp)")
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
            WorkflowTransitionRecord.self,
            TaskRecord.self,
            ProductionQueueRecord.self
        ], inMemory: true)
}
