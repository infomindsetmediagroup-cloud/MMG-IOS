import Foundation

struct DesignStudioProjectFactory {
    private let workflowRuntime = WorkflowRuntimeService()
    private let taskRuntime = TaskRuntimeService()
    private let queueRuntime = ProductionQueueService()

    func createProjectPackage(
        customerName: String,
        title: String,
        summary: String,
        brandProfile: String = ""
    ) -> DesignStudioProjectPackage {
        let knowledge = KnowledgeVaultRecord(
            customerName: customerName,
            brandProfile: brandProfile,
            projectContext: summary,
            decisionHistory: "Project context created during Design Studio project creation."
        )

        let workflow = workflowRuntime.createWorkflow(
            customer: customerName,
            projectID: "pending-design-project",
            projectTitle: title,
            type: .designStudio,
            priority: .normal,
            owner: "Kairos",
            summary: summary
        )

        let task = taskRuntime.createInitialTask(for: workflow)
        let queueItem = queueRuntime.createQueueItem(for: task, workflow: workflow)

        let project = DesignStudioProjectRecord(
            customerName: customerName,
            title: title,
            summary: summary,
            workflowID: workflow.id,
            taskID: task.id,
            queueID: queueItem.id,
            knowledgeVaultID: knowledge.id
        )

        workflow.projectID = project.id

        return DesignStudioProjectPackage(
            project: project,
            workflow: workflow,
            task: task,
            queueItem: queueItem,
            knowledge: knowledge
        )
    }
}

struct DesignStudioProjectPackage {
    let project: DesignStudioProjectRecord
    let workflow: WorkflowRecord
    let task: TaskRecord
    let queueItem: ProductionQueueRecord
    let knowledge: KnowledgeVaultRecord
}
