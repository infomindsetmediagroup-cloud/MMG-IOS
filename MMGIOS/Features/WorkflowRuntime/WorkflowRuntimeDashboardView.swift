import SwiftData
import SwiftUI

struct WorkflowRuntimeDashboardView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \WorkflowTransitionRecord.createdAt, order: .reverse) private var transitions: [WorkflowTransitionRecord]

    private let runtime = WorkflowRuntimeService()

    private var activeWorkflows: [WorkflowRecord] {
        workflows.filter { $0.status == WorkflowStatus.active.rawValue || $0.status == WorkflowStatus.draft.rawValue }
    }

    private var waitingForApproval: [WorkflowRecord] {
        workflows.filter { $0.status == WorkflowStatus.waitingForApproval.rawValue }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Runtime Status") {
                    LabeledContent("Total workflows", value: "\(workflows.count)")
                    LabeledContent("Active", value: "\(activeWorkflows.count)")
                    LabeledContent("Waiting approval", value: "\(waitingForApproval.count)")
                    LabeledContent("Transitions", value: "\(transitions.count)")
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
        modelContext.insert(workflow)
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
}

#Preview {
    WorkflowRuntimeDashboardView()
        .modelContainer(for: [
            WorkflowRecord.self,
            WorkflowTransitionRecord.self
        ], inMemory: true)
}
