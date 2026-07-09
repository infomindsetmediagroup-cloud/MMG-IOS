import Foundation

struct WorkflowCommandState {
    let canAdvance: Bool
    let canRequestApproval: Bool
    let canApprove: Bool
    let canReject: Bool
    let canBlock: Bool
    let canResume: Bool
    let canComplete: Bool
    let canArchive: Bool
    let reason: String
}

struct WorkflowCommandPolicy {
    func evaluate(_ workflow: WorkflowRecord) -> WorkflowCommandState {
        let status = RuntimeWorkflowStatus(rawValue: workflow.status)
        let stage = RuntimeWorkflowStage(rawValue: workflow.stage)
        let isTerminal = status == .completed || status == .archived || status == .cancelled
        let isBlocked = status == .blocked
        let isApproval = status == .waitingForApproval || stage == .approval
        let hasForwardStage = stage.flatMap { WorkflowStagePolicy.nextStages(from: $0).first } != nil

        if isTerminal {
            return WorkflowCommandState(
                canAdvance: false,
                canRequestApproval: false,
                canApprove: false,
                canReject: false,
                canBlock: false,
                canResume: false,
                canComplete: false,
                canArchive: status == .completed,
                reason: "Terminal workflow state. Only archive is available for completed workflows."
            )
        }

        if isBlocked {
            return WorkflowCommandState(
                canAdvance: false,
                canRequestApproval: false,
                canApprove: false,
                canReject: false,
                canBlock: false,
                canResume: true,
                canComplete: false,
                canArchive: false,
                reason: "Workflow is blocked. Resume after resolving the blocker."
            )
        }

        if isApproval {
            return WorkflowCommandState(
                canAdvance: false,
                canRequestApproval: false,
                canApprove: true,
                canReject: true,
                canBlock: true,
                canResume: false,
                canComplete: false,
                canArchive: false,
                reason: "Workflow is waiting for an approval decision."
            )
        }

        return WorkflowCommandState(
            canAdvance: hasForwardStage,
            canRequestApproval: stage != .approval,
            canApprove: false,
            canReject: false,
            canBlock: true,
            canResume: false,
            canComplete: stage == .export,
            canArchive: false,
            reason: "Workflow is active and available for normal execution commands."
        )
    }
}
