import Foundation

struct CommandCenterWorkflowHealthSummary {
    let healthyCount: Int
    let blockedCount: Int
    let approvalCount: Int
    let nearHandoffCount: Int
    let closedCount: Int
    let averageScore: Int
    let executiveSummary: String
}

struct CommandCenterWorkflowHealthSummaryBuilder {
    private let healthBuilder = WorkflowHealthSummaryBuilder()

    func summarize(
        workflows: [WorkflowRecord],
        tasks: [TaskRecord],
        queueItems: [ProductionQueueRecord],
        transitions: [WorkflowTransitionRecord]
    ) -> CommandCenterWorkflowHealthSummary {
        guard workflows.isEmpty == false else {
            return CommandCenterWorkflowHealthSummary(
                healthyCount: 0,
                blockedCount: 0,
                approvalCount: 0,
                nearHandoffCount: 0,
                closedCount: 0,
                averageScore: 0,
                executiveSummary: "No workflows are active in the runtime yet."
            )
        }

        let summaries = workflows.map { workflow in
            healthBuilder.summarize(workflow: workflow, tasks: tasks, queueItems: queueItems, transitions: transitions)
        }
        let blocked = summaries.filter { $0.label == "Blocked" }.count
        let approval = summaries.filter { $0.label == "Approval Needed" }.count
        let nearHandoff = summaries.filter { $0.label == "Near Handoff" }.count
        let closed = summaries.filter { $0.label == "Closed" }.count
        let healthy = summaries.filter { $0.label == "Healthy" }.count
        let average = summaries.map(\.score).reduce(0, +) / max(summaries.count, 1)

        let executiveSummary: String
        if blocked > 0 {
            executiveSummary = "\(blocked) workflow(s) require immediate operator attention."
        } else if approval > 0 {
            executiveSummary = "\(approval) workflow(s) are waiting for approval decisions."
        } else if nearHandoff > 0 {
            executiveSummary = "\(nearHandoff) workflow(s) are approaching handoff."
        } else {
            executiveSummary = "Workflow runtime is healthy with no immediate blockers."
        }

        return CommandCenterWorkflowHealthSummary(
            healthyCount: healthy,
            blockedCount: blocked,
            approvalCount: approval,
            nearHandoffCount: nearHandoff,
            closedCount: closed,
            averageScore: average,
            executiveSummary: executiveSummary
        )
    }
}
