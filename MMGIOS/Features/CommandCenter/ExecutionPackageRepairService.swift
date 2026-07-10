import Foundation

struct ExecutionPackageRepairService {
    private let taskRuntime = TaskRuntimeService()
    private let queueRuntime = ProductionQueueService()

    func repairMissingTasks(
        workflows: [WorkflowRecord],
        tasks: [TaskRecord]
    ) -> [TaskRecord] {
        let workflowIDsWithTasks = Set(tasks.map(\.workflowID))

        return workflows
            .filter { !workflowIDsWithTasks.contains($0.id) }
            .map { taskRuntime.createInitialTask(for: $0) }
    }

    func repairMissingQueueItems(
        workflows: [WorkflowRecord],
        tasks: [TaskRecord],
        queueItems: [ProductionQueueRecord]
    ) -> [ProductionQueueRecord] {
        let taskIDsWithQueueItems = Set(queueItems.map(\.taskID))
        let workflowsByID = Dictionary(uniqueKeysWithValues: workflows.map { ($0.id, $0) })

        return tasks.compactMap { task in
            guard !taskIDsWithQueueItems.contains(task.id),
                  let workflow = workflowsByID[task.workflowID]
            else {
                return nil
            }

            return queueRuntime.createQueueItem(for: task, workflow: workflow)
        }
    }

    func repairableIssueCount(
        workflows: [WorkflowRecord],
        tasks: [TaskRecord],
        queueItems: [ProductionQueueRecord]
    ) -> Int {
        repairMissingTasks(workflows: workflows, tasks: tasks).count +
        repairMissingQueueItems(
            workflows: workflows,
            tasks: tasks,
            queueItems: queueItems
        ).count
    }
}
