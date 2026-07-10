import SwiftUI

struct ExecutionPackageHealth: Identifiable {
    let workflow: WorkflowRecord
    let task: TaskRecord
    let queueItem: ProductionQueueRecord

    var id: String { workflow.id }

    var state: ExecutionPackageHealthState {
        ExecutionPackageHealthPolicy.state(
            workflow: workflow,
            task: task,
            queueItem: queueItem
        )
    }

    var blocker: String? {
        ExecutionPackageHealthPolicy.blocker(task: task, queueItem: queueItem)
    }
}

enum ExecutionPackageHealthState: Equatable {
    case ready
    case active
    case blocked
    case completed

    var label: String {
        switch self {
        case .ready:
            return "Ready"
        case .active:
            return "Active"
        case .blocked:
            return "Blocked"
        case .completed:
            return "Complete"
        }
    }

    var tint: Color {
        switch self {
        case .ready, .active:
            return .mmgBlue
        case .blocked:
            return .orange
        case .completed:
            return .green
        }
    }
}

enum ExecutionPackageHealthPolicy {
    static func state(
        workflow: WorkflowRecord,
        task: TaskRecord,
        queueItem: ProductionQueueRecord
    ) -> ExecutionPackageHealthState {
        if task.status == ProductionTaskStatus.completed.rawValue &&
            queueItem.status == ProductionQueueStatus.completed.rawValue {
            return .completed
        }

        if workflow.status == RuntimeWorkflowStatus.blocked.rawValue ||
            task.status == ProductionTaskStatus.blocked.rawValue ||
            queueItem.status == ProductionQueueStatus.blocked.rawValue {
            return .blocked
        }

        if task.status == ProductionTaskStatus.inProgress.rawValue ||
            queueItem.status == ProductionQueueStatus.active.rawValue {
            return .active
        }

        return .ready
    }

    static func blocker(
        task: TaskRecord,
        queueItem: ProductionQueueRecord
    ) -> String? {
        if !task.blocker.isEmpty {
            return task.blocker
        }

        if !queueItem.blocker.isEmpty {
            return queueItem.blocker
        }

        return nil
    }

    static func packages(
        workflows: [WorkflowRecord],
        tasks: [TaskRecord],
        queueItems: [ProductionQueueRecord]
    ) -> [ExecutionPackageHealth] {
        workflows.compactMap { workflow in
            guard let task = tasks.first(where: { $0.workflowID == workflow.id }),
                  let queueItem = queueItems.first(where: { $0.taskID == task.id })
            else {
                return nil
            }

            return ExecutionPackageHealth(
                workflow: workflow,
                task: task,
                queueItem: queueItem
            )
        }
    }
}
