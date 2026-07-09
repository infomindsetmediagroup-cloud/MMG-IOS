import Foundation

struct WorkflowHealthSummary {
    let label: String
    let score: Int
    let detail: String
    let isAttentionRequired: Bool
}

struct WorkflowHealthSummaryBuilder {
    func summarize(
        workflow: WorkflowRecord,
        tasks: [TaskRecord],
        queueItems: [ProductionQueueRecord],
        transitions: [WorkflowTransitionRecord]
    ) -> WorkflowHealthSummary {
        let workflowTasks = tasks.filter { $0.workflowID == workflow.id }
        let workflowQueueItems = queueItems.filter { $0.workflowID == workflow.id }
        let workflowTransitions = transitions.filter { $0.workflowID == workflow.id }
        let blockedTaskCount = workflowTasks.filter { !$0.blocker.isEmpty }.count
        let blockedQueueCount = workflowQueueItems.filter { !$0.blocker.isEmpty }.count
        let status = RuntimeWorkflowStatus(rawValue: workflow.status)

        if status == .blocked || blockedTaskCount > 0 || blockedQueueCount > 0 {
            return WorkflowHealthSummary(
                label: "Blocked",
                score: 35,
                detail: "Workflow requires operator attention. Blocked tasks: \(blockedTaskCount). Blocked queue items: \(blockedQueueCount).",
                isAttentionRequired: true
            )
        }

        if status == .waitingForApproval {
            return WorkflowHealthSummary(
                label: "Approval Needed",
                score: 62,
                detail: "Workflow is waiting for an approval decision before it can continue.",
                isAttentionRequired: true
            )
        }

        if status == .completed || status == .archived {
            return WorkflowHealthSummary(
                label: "Closed",
                score: 100,
                detail: "Workflow has reached a terminal state with \(workflowTransitions.count) recorded transitions.",
                isAttentionRequired: false
            )
        }

        if workflow.progress >= 70 {
            return WorkflowHealthSummary(
                label: "Near Handoff",
                score: 84,
                detail: "Workflow is in late-stage execution with \(workflowTasks.count) linked tasks and \(workflowQueueItems.count) queue items.",
                isAttentionRequired: false
            )
        }

        return WorkflowHealthSummary(
            label: "Healthy",
            score: max(55, workflow.progress),
            detail: "Workflow is active with no blocking task or queue signals detected.",
            isAttentionRequired: false
        )
    }
}
