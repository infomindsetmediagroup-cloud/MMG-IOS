import SwiftData
import SwiftUI

struct WorkflowRuntimeDashboardView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \WorkflowTransitionRecord.createdAt, order: .reverse) private var transitions: [WorkflowTransitionRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]

    private let runtime = WorkflowRuntimeService()
    private let taskRuntime = TaskRuntimeService()
    private let queueRuntime = ProductionQueueService()

    private var activeWorkflows: [WorkflowRecord] {
        workflows.filter { $0.status == WorkflowStatus.active.rawValue || $0.status == WorkflowStatus.draft.rawValue }
    }

    private var waitingForApproval: [WorkflowRecord] {
        workflows.filter { $0.status == WorkflowStatus.waitingForApproval.rawValue }
    }

    private var openTasks: [TaskRecord] {
        tasks.filter { $0.status != ProductionTaskStatus.completed.rawValue && $0.status != ProductionTaskStatus.cancelled.rawValue }
    }

    private var openQueueItems: [ProductionQueueRecord] {
        queueItems.filter { $0.status != ProductionQueueStatus.completed.rawValue }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Runtime Status") {
                    LabeledContent("Total workflows", value: "\(workflows.count)")
                    LabeledContent("Active", value: "\(activeWorkflows.count)")
                    LabeledContent("Waiting approval", value: "\(waitingForApproval.count)")
                    LabeledContent("Transitions", value: "\(transitions.count)")
                    LabeledContent("Open tasks", value: "\(openTasks.count)")
                    LabeledContent("Open queue", value: "\(openQueueItems.count)")
                }

                Section("Workflows") {
                    if workflows.isEmpty {
                        Text("No workflows yet. Seed a workflow to validate the runtime.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(workflows) { workflow in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(workflow.projectTitle).font(.headline)
                                Text("\(workflow.type) • \(workflow.stage) • \(workflow.status)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                ProgressView(value: Double(workflow.progress), total: 100)
                                Text("Owner: \(workflow.owner) • Priority: \(workflow.priority)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("Task Queue") {
                    if tasks.isEmpty {
                        Text("No tasks yet. Seeded workflows generate an initial production task.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(tasks) { task in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(task.title).font(.headline)
                                Text("\(task.department) • \(task.status) • \(task.priority)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(task.detail)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                if !task.blocker.isEmpty {
                                    Text("Blocked: \(task.blocker)")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section("Production Queue") {
                    if queueItems.isEmpty {
                        Text("No queue items yet. Seeded workflows create queue entries from generated tasks.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(queueItems) { item in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(item.summary).font(.headline)
                                Text("\(item.lane) • \(item.status) • \(item.priority)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text("Position: \(item.position)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                if !item.blocker.isEmpty {
                                    Text("Blocked: \(item.blocker)")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section("Transition History") {
                    if transitions.isEmpty {
                        Text("No workflow transitions recorded yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(transitions) { transition in
                            VStack(alignment: .leading, spacing: 5) {
                                Text("\(transition.fromStage) → \(transition.toStage)")
                                    .font(.headline)
                                Text("Actor: \(transition.actor) • Trigger: \(transition.trigger)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if !transition.notes.isEmpty {
                                    Text(transition.notes)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Workflow Runtime")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button("Seed") { seedWorkflowIfNeeded() }
                    Button("Advance") { advanceFirstWorkflow() }
                    Button("Complete Task") { completeFirstOpenTask() }
                    Button("Complete Queue") { completeFirstOpenQueueItem() }
                }
            }
            .task { seedWorkflowIfNeeded() }
        }
    }

    private func seedWorkflowIfNeeded() {
        guard workflows.isEmpty else { return }
        let workflow = runtime.createWorkflow(
            customer: "MMG Demo Customer",
            projectID: "demo-project",
            projectTitle: "Creator Education Starter Guide",
            type: .designStudio,
            priority: .high,
            owner: "Kairos",
            summary: "Runtime validation workflow attached to the Design Studio production path."
        )
        let task = taskRuntime.createInitialTask(for: workflow)
        let queueItem = queueRuntime.createQueueItem(for: task, workflow: workflow)
        modelContext.insert(workflow)
        modelContext.insert(task)
        modelContext.insert(queueItem)
        try? modelContext.save()
    }

    private func advanceFirstWorkflow() {
        guard let workflow = workflows.first,
              let currentStage = WorkflowStage(rawValue: workflow.stage),
              let nextStage = WorkflowStagePolicy.nextStages(from: currentStage).first,
              let transition = runtime.transition(
                workflow: workflow,
                to: nextStage,
                actor: "Kairos Runtime",
                trigger: "Manual dashboard advance",
                notes: "Advanced through Workflow Runtime dashboard."
              )
        else { return }

        modelContext.insert(transition)
        try? modelContext.save()
    }

    private func completeFirstOpenTask() {
        guard let task = openTasks.first else { return }
        taskRuntime.complete(task)
        try? modelContext.save()
    }

    private func completeFirstOpenQueueItem() {
        guard let item = openQueueItems.first else { return }
        queueRuntime.complete(item)
        try? modelContext.save()
    }
}

#Preview {
    WorkflowRuntimeDashboardView()
        .modelContainer(for: [
            WorkflowRecord.self,
            WorkflowTransitionRecord.self,
            TaskRecord.self,
            TaskDependencyRecord.self,
            ProductionQueueRecord.self
        ], inMemory: true)
}
