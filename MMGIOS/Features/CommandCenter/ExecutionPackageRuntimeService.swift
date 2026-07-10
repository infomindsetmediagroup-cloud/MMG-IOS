import Foundation

struct ExecutionPackageRuntimeService {
    private let workflowRuntime = WorkflowRuntimeService()
    private let taskRuntime = TaskRuntimeService()
    private let queueRuntime = ProductionQueueService()

    func start(
        workflow: WorkflowRecord,
        task: TaskRecord,
        queueItem: ProductionQueueRecord
    ) -> [WorkflowTransitionRecord] {
        var transitions: [WorkflowTransitionRecord] = []

        transitions.append(contentsOf: advance(
            workflow: workflow,
            through: [.planning, .production],
            trigger: "Execution package started"
        ))

        taskRuntime.start(task)
        queueRuntime.activate(queueItem)
        return transitions
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
    ) -> [WorkflowTransitionRecord] {
        taskRuntime.complete(task)
        queueRuntime.complete(queueItem)

        let remainingStages = completionPath(from: workflow.stage)
        return advance(
            workflow: workflow,
            through: remainingStages,
            trigger: "Execution package completed"
        )
    }

    private func advance(
        workflow: WorkflowRecord,
        through stages: [RuntimeWorkflowStage],
        trigger: String
    ) -> [WorkflowTransitionRecord] {
        stages.compactMap { stage in
            workflowRuntime.transition(
                workflow: workflow,
                to: stage,
                actor: "Kairos",
                trigger: trigger
            )
        }
    }

    private func completionPath(from rawStage: String) -> [RuntimeWorkflowStage] {
        guard let stage = RuntimeWorkflowStage(rawValue: rawStage) else {
            return []
        }

        switch stage {
        case .intake:
            return [.planning, .production, .humanReview, .approval, .export, .delivery]
        case .planning:
            return [.production, .humanReview, .approval, .export, .delivery]
        case .production:
            return [.humanReview, .approval, .export, .delivery]
        case .aiGeneration:
            return [.humanReview, .approval, .export, .delivery]
        case .humanReview:
            return [.approval, .export, .delivery]
        case .customerReview:
            return [.approval, .export, .delivery]
        case .approval:
            return [.export, .delivery]
        case .export:
            return [.delivery]
        case .delivery, .archived:
            return []
        }
    }
}
