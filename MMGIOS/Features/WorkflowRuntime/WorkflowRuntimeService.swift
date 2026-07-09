import Foundation

struct WorkflowRuntimeService {
    func createWorkflow(
        customer: String,
        projectID: String,
        projectTitle: String,
        type: RuntimeWorkflowType,
        priority: RuntimeWorkflowPriority = .normal,
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
        to nextStage: RuntimeWorkflowStage,
        actor: String,
        trigger: String,
        notes: String = ""
    ) -> WorkflowTransitionRecord? {
        guard let currentStage = RuntimeWorkflowStage(rawValue: workflow.stage),
              let currentStatus = RuntimeWorkflowStatus(rawValue: workflow.status),
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

    func requestApproval(workflow: WorkflowRecord, actor: String, notes: String = "") -> WorkflowTransitionRecord? {
        commandTransition(
            workflow: workflow,
            toStage: .approval,
            toStatus: .waitingForApproval,
            actor: actor,
            trigger: "Approval requested",
            notes: notes.isEmpty ? "Workflow moved to approval queue." : notes
        )
    }

    func approve(workflow: WorkflowRecord, actor: String, notes: String = "") -> WorkflowTransitionRecord? {
        commandTransition(
            workflow: workflow,
            toStage: .export,
            toStatus: .active,
            actor: actor,
            trigger: "Workflow approved",
            notes: notes.isEmpty ? "Approval granted. Workflow moved to export readiness." : notes
        )
    }

    func reject(workflow: WorkflowRecord, actor: String, notes: String = "") -> WorkflowTransitionRecord? {
        commandTransition(
            workflow: workflow,
            toStage: .humanReview,
            toStatus: .active,
            actor: actor,
            trigger: "Workflow rejected",
            notes: notes.isEmpty ? "Approval rejected. Workflow returned to human review." : notes
        )
    }

    func block(workflow: WorkflowRecord, actor: String, notes: String = "") -> WorkflowTransitionRecord? {
        guard let currentStage = RuntimeWorkflowStage(rawValue: workflow.stage) else { return nil }
        return commandTransition(
            workflow: workflow,
            toStage: currentStage,
            toStatus: .blocked,
            actor: actor,
            trigger: "Workflow blocked",
            notes: notes.isEmpty ? "Workflow blocked for operator review." : notes
        )
    }

    func resume(workflow: WorkflowRecord, actor: String, notes: String = "") -> WorkflowTransitionRecord? {
        guard let currentStage = RuntimeWorkflowStage(rawValue: workflow.stage) else { return nil }
        return commandTransition(
            workflow: workflow,
            toStage: currentStage,
            toStatus: status(for: currentStage),
            actor: actor,
            trigger: "Workflow resumed",
            notes: notes.isEmpty ? "Workflow resumed after blocker review." : notes
        )
    }

    func complete(workflow: WorkflowRecord, actor: String, notes: String = "") -> WorkflowTransitionRecord? {
        commandTransition(
            workflow: workflow,
            toStage: .delivery,
            toStatus: .completed,
            actor: actor,
            trigger: "Workflow completed",
            notes: notes.isEmpty ? "Workflow marked complete and ready for handoff/archive." : notes
        )
    }

    func archive(workflow: WorkflowRecord, actor: String, notes: String = "") -> WorkflowTransitionRecord? {
        commandTransition(
            workflow: workflow,
            toStage: .archived,
            toStatus: .archived,
            actor: actor,
            trigger: "Workflow archived",
            notes: notes.isEmpty ? "Workflow archived after completion or executive decision." : notes
        )
    }

    func status(for stage: RuntimeWorkflowStage) -> RuntimeWorkflowStatus {
        if stage == .approval { return .waitingForApproval }
        if stage == .delivery { return .completed }
        if stage == .archived { return .archived }
        return .active
    }

    private func commandTransition(
        workflow: WorkflowRecord,
        toStage: RuntimeWorkflowStage,
        toStatus: RuntimeWorkflowStatus,
        actor: String,
        trigger: String,
        notes: String
    ) -> WorkflowTransitionRecord? {
        guard let currentStage = RuntimeWorkflowStage(rawValue: workflow.stage),
              let currentStatus = RuntimeWorkflowStatus(rawValue: workflow.status)
        else { return nil }

        let transition = WorkflowTransitionRecord(
            workflowID: workflow.id,
            fromStage: currentStage,
            toStage: toStage,
            fromStatus: currentStatus,
            toStatus: toStatus,
            actor: actor,
            trigger: trigger,
            notes: notes
        )

        workflow.stage = toStage.rawValue
        workflow.status = toStatus.rawValue
        workflow.progress = WorkflowStageProgress.percent(for: toStage)
        workflow.updatedAt = .now
        return transition
    }
}
