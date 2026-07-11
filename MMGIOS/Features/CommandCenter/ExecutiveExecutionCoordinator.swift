import Foundation

struct ExecutiveExecutionPackage {
    let workflow: WorkflowRecord
    let task: TaskRecord
    let queueItem: ProductionQueueRecord
}

struct ExecutiveExecutionCoordinator {
    private let workflowFactory = ExecutiveWorkflowFactory()
    private let taskRuntime = TaskRuntimeService()
    private let queueRuntime = ProductionQueueService()
    private let approvalPolicy = KairosApprovalPolicy()

    func approveAndQueue(record: KnowledgeVaultRecord) -> ExecutiveExecutionPackage {
        let requirement = approvalPolicy.requirement(for: record)
        appendHistory(
            approvalPolicy.approvalNote(decision: .approved, category: requirement.category),
            to: record
        )

        let workflow = workflowFactory.createWorkflow(from: record)
        let task = taskRuntime.createInitialTask(for: workflow)
        let queueItem = queueRuntime.createQueueItem(for: task, workflow: workflow)
        appendHistory("Workflow ID: \(workflow.id)", to: record)
        appendHistory("Task ID: \(task.id)", to: record)
        appendHistory("Queue Item ID: \(queueItem.id)", to: record)
        appendHistory("Execution Package Queued: waiting for an authorized execution adapter", to: record)
        appendState(.readyToExecute, to: record)

        return ExecutiveExecutionPackage(
            workflow: workflow,
            task: task,
            queueItem: queueItem
        )
    }

    private func appendState(_ status: ExecutiveActionState, to record: KnowledgeVaultRecord) {
        let timestamp = Date().formatted(date: .abbreviated, time: .shortened)
        appendHistory("Action Status: \(status.label) @ \(timestamp)", to: record)
    }

    private func appendHistory(_ note: String, to record: KnowledgeVaultRecord) {
        record.decisionHistory = record.decisionHistory.isEmpty ? note : record.decisionHistory + "\n\n" + note
        record.updatedAt = .now
    }
}
