import Foundation

struct ExecutionPackageRuntimeService {
    private let workflowRuntime = WorkflowRuntimeService()
    private let taskRuntime = TaskRuntimeService()
    private let queueRuntime = ProductionQueueService()

    func start(
        workflow: WorkflowRecord,
        task: TaskRecord,
        queueItem: ProductionQueueRecord
    ) -> WorkflowTransitionRecord? {
        let transition = workflowRuntime.transition(
            workflow: workflow,
            to: .production,
            actor: "Kairos",
            trigger: "Execution package started"
        )

        taskRuntime.start(task)
        queueRuntime.activate(queueItem)
        return transition
    }

    func block(
        workflow: WorkflowRecord,
        task: TaskRecord,
        queueItem: ProductionQueueRecord,
        reason: String
    ) {
        workflow.status = RuntimeWorkflowStatus.blocked.rawValue
        workflow.updatedAt = .now
        taskRuntime.block(task, reason: reason)
        queueRuntime.block(queueItem, reason: reason)
    }

    func retry(
        workflow: WorkflowRecord,
        task: TaskRecord,
        queueItem: ProductionQueueRecord
    ) {
        workflow.status = RuntimeWorkflowStatus.active.rawValue
        workflow.updatedAt = .now
        task.status = ProductionTaskStatus.ready.rawValue
        task.blocker = ""
        task.updatedAt = .now
        queueItem.status = ProductionQueueStatus.retry.rawValue
        queueItem.blocker = ""
        queueItem.updatedAt = .now
    }

    func complete(
        workflow: WorkflowRecord,
        task: TaskRecord,
        queueItem: ProductionQueueRecord
    ) -> WorkflowTransitionRecord? {
        taskRuntime.complete(task)
        queueRuntime.complete(queueItem)

        return workflowRuntime.transition(
            workflow: workflow,
            to: .delivery,
            actor: "Kairos",
            trigger: "Execution package completed"
        )
    }
}
