import Foundation

struct WorkflowRuntimeService {
    func createWorkflow(
        customer: String,
        projectID: String,
        projectTitle: String,
        type: WorkflowType,
        priority: WorkflowPriority = .normal,
        owner: String = "Kairos",
        summary: String
    ) -> WorkflowRecord {
        WorkflowRecord(
            customer: customer,
            projectID: projectID,
            projectTitle: projectTitle,
            type: type,
            stage: .intake,
            status: .draft,
            priority: priority,
            owner: owner,
            summary: summary
        )
    }

    func transition(
        workflow: WorkflowRecord,
        to nextStage: WorkflowStage,
        actor: String,
        trigger: String,
        notes: String = ""
    ) -> WorkflowTransitionRecord? {
        guard let currentStage = WorkflowStage(rawValue: workflow.stage),
              let currentStatus = WorkflowStatus(rawValue: workflow.status),
              WorkflowStagePolicy.allows(nextStage, from: currentStage)
        else { return nil }

        let nextStatus = status(for: nextStage)
        let transition = WorkflowTransitionRecord(
            workflowID: workflow.id,
            fromStage: currentStage,
            toStage: nextStage,
            fromStatus: currentStatus,
            toStatus: nextStatus,
            actor: actor,
            trigger: trigger,
            notes: notes
        )

        workflow.stage = nextStage.rawValue
        workflow.status = nextStatus.rawValue
        workflow.progress = WorkflowStageProgress.percent(for: nextStage)
        workflow.updatedAt = .now
        return transition
    }

    func status(for stage: WorkflowStage) -> WorkflowStatus {
        if stage == .approval { return .waitingForApproval }
        if stage == .delivery { return .completed }
        if stage == .archived { return .archived }
        return .active
    }
}
