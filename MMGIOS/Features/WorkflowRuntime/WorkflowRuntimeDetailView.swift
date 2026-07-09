import SwiftData
import SwiftUI

struct WorkflowRuntimeDetailView: View {
    let workflow: WorkflowRecord

    @Query(sort: \WorkflowTransitionRecord.createdAt, order: .reverse) private var transitions: [WorkflowTransitionRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]

    private var workflowTransitions: [WorkflowTransitionRecord] {
        transitions.filter { $0.workflowID == workflow.id }
    }

    private var workflowTasks: [TaskRecord] {
        tasks.filter { $0.workflowID == workflow.id }
    }

    private var workflowQueueItems: [ProductionQueueRecord] {
        queueItems.filter { $0.workflowID == workflow.id }
    }

    private var isBlocked: Bool {
        workflow.status == RuntimeWorkflowStatus.blocked.rawValue || workflowTasks.contains { !$0.blocker.isEmpty } || workflowQueueItems.contains { !$0.blocker.isEmpty }
    }

    private var nextAction: String {
        if isBlocked {
            return "Resolve the blocker before advancing this workflow."
        }
        if workflow.status == RuntimeWorkflowStatus.waitingForApproval.rawValue {
            return "Collect approval decision and record the transition."
        }
        if workflow.progress >= 100 || workflow.status == RuntimeWorkflowStatus.completed.rawValue {
            return "Archive or hand off completed workflow outputs."
        }
        return "Advance the workflow to the next approved stage when task and queue state are ready."
    }

    var body: some View {
        List {
            Section("Workflow") {
                LabeledContent("Project", value: workflow.projectTitle)
                LabeledContent("Customer", value: workflow.customer)
                LabeledContent("Type", value: workflow.type)
                LabeledContent("Stage", value: workflow.stage)
                LabeledContent("Status", value: workflow.status)
                LabeledContent("Priority", value: workflow.priority)
                LabeledContent("Owner", value: workflow.owner)
                ProgressView(value: Double(workflow.progress), total: 100)
                Text("\(workflow.progress)% complete")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Recommended Next Action") {
                Label(isBlocked ? "Blocked" : "Ready", systemImage: isBlocked ? "exclamationmark.triangle" : "arrow.forward.circle")
                    .foregroundColor(isBlocked ? .orange : .secondary)
                Text(nextAction)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Section("Summary") {
                Text(workflow.summary)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                LabeledContent("Created", value: workflow.createdAt.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Updated", value: workflow.updatedAt.formatted(date: .abbreviated, time: .shortened))
            }

            Section("Workflow Tasks") {
                if workflowTasks.isEmpty {
                    Text("No workflow tasks linked yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(workflowTasks) { task in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(task.title).font(.subheadline.bold())
                            Text("\(task.department) • \(task.status) • \(task.priority)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(task.detail)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            if !task.blocker.isEmpty {
                                Text("Blocked: \(task.blocker)")
                                    .font(.caption2)
                                    .foregroundColor(.orange)
                            }
                        }
                    }
                }
            }

            Section("Production Queue") {
                if workflowQueueItems.isEmpty {
                    Text("No queue items linked yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(workflowQueueItems) { item in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(item.summary).font(.subheadline.bold())
                            Text("\(item.lane) • \(item.status) • \(item.priority)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("Position: \(item.position)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            if !item.blocker.isEmpty {
                                Text("Blocked: \(item.blocker)")
                                    .font(.caption2)
                                    .foregroundColor(.orange)
                            }
                        }
                    }
                }
            }

            Section("Transition History") {
                if workflowTransitions.isEmpty {
                    Text("No transitions recorded for this workflow yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(workflowTransitions) { transition in
                        VStack(alignment: .leading, spacing: 5) {
                            Text("\(transition.fromStage) → \(transition.toStage)")
                                .font(.subheadline.bold())
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
        .navigationTitle("Workflow Detail")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        WorkflowRuntimeDetailView(
            workflow: WorkflowRecord(
                customer: "MMG Demo Customer",
                projectID: "demo-project",
                projectTitle: "Creator Education Starter Guide",
                type: .designStudio,
                priority: .high,
                owner: "Kairos",
                summary: "Runtime validation workflow attached to the Design Studio production path."
            )
        )
    }
    .modelContainer(for: [
        WorkflowRecord.self,
        WorkflowTransitionRecord.self,
        TaskRecord.self,
        ProductionQueueRecord.self
    ], inMemory: true)
}
