import Foundation

struct ExecutionPackageIntegrityReport: Equatable {
    let completePackageCount: Int
    let workflowsMissingTasks: [String]
    let tasksMissingWorkflows: [String]
    let tasksMissingQueueItems: [String]
    let queueItemsMissingTasks: [String]

    var issueCount: Int {
        workflowsMissingTasks.count +
        tasksMissingWorkflows.count +
        tasksMissingQueueItems.count +
        queueItemsMissingTasks.count
    }

    var isHealthy: Bool {
        issueCount == 0
    }
}

enum ExecutionPackageIntegrityPolicy {
    static func report(
        workflows: [WorkflowRecord],
        tasks: [TaskRecord],
        queueItems: [ProductionQueueRecord]
    ) -> ExecutionPackageIntegrityReport {
        let workflowIDs = Set(workflows.map(\.id))
        let taskIDs = Set(tasks.map(\.id))
        let workflowIDsWithTasks = Set(tasks.map(\.workflowID))
        let taskIDsWithQueueItems = Set(queueItems.map(\.taskID))

        let workflowsMissingTasks = workflows
            .filter { !workflowIDsWithTasks.contains($0.id) }
            .map(\.id)

        let tasksMissingWorkflows = tasks
            .filter { !workflowIDs.contains($0.workflowID) }
            .map(\.id)

        let tasksMissingQueueItems = tasks
            .filter { !taskIDsWithQueueItems.contains($0.id) }
            .map(\.id)

        let queueItemsMissingTasks = queueItems
            .filter { !taskIDs.contains($0.taskID) }
            .map(\.id)

        return ExecutionPackageIntegrityReport(
            completePackageCount: ExecutionPackageHealthPolicy.packages(
                workflows: workflows,
                tasks: tasks,
                queueItems: queueItems
            ).count,
            workflowsMissingTasks: workflowsMissingTasks,
            tasksMissingWorkflows: tasksMissingWorkflows,
            tasksMissingQueueItems: tasksMissingQueueItems,
            queueItemsMissingTasks: queueItemsMissingTasks
        )
    }
}
