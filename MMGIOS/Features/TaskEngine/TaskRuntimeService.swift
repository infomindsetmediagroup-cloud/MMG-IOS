import Foundation

struct TaskRuntimeService {
    func createInitialTask(for workflow: WorkflowRecord) -> TaskRecord {
        TaskRecord(
            workflowID: workflow.id,
            title: "Start production workflow",
            detail: "Initial task generated for \(workflow.projectTitle).",
            department: department(for: workflow),
            assignee: workflow.owner,
            status: .ready,
            priority: priority(from: workflow.priority)
        )
    }

    func start(_ task: TaskRecord) {
        task.status = ProductionTaskStatus.inProgress.rawValue
        task.updatedAt = .now
    }

    func block(_ task: TaskRecord, reason: String) {
        task.status = ProductionTaskStatus.blocked.rawValue
        task.blocker = reason
        task.updatedAt = .now
    }

    func complete(_ task: TaskRecord) {
        task.status = ProductionTaskStatus.completed.rawValue
        task.blocker = ""
        task.updatedAt = .now
    }

    func canStart(_ task: TaskRecord, dependencies: [TaskDependencyRecord], tasks: [TaskRecord]) -> Bool {
        let required = dependencies.filter { $0.taskID == task.id }
        return required.allSatisfy { dependency in
            tasks.contains { candidate in
                candidate.id == dependency.dependsOnTaskID && candidate.status == ProductionTaskStatus.completed.rawValue
            }
        }
    }

    func department(for workflow: WorkflowRecord) -> ProductionDepartment {
        guard let type = RuntimeWorkflowType(rawValue: workflow.type) else {
            return .kairos
        }

        switch type {
        case .publishing:
            return .publishing
        case .designStudio:
            return .design
        case .marketing:
            return .marketing
        case .customerSuccess:
            return .customerSuccess
        case .website, .kairosOrchestration:
            return .kairos
        }
    }

    private func priority(from workflowPriority: String) -> ProductionTaskPriority {
        ProductionTaskPriority(rawValue: workflowPriority) ?? .normal
    }
}
