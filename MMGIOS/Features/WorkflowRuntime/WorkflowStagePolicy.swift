import Foundation

struct WorkflowStagePolicy {
    static func nextStages(from stage: RuntimeWorkflowStage) -> [RuntimeWorkflowStage] {
        if stage == .intake { return [.planning] }
        if stage == .planning { return [.production, .aiGeneration] }
        if stage == .production { return [.humanReview, .customerReview] }
        if stage == .aiGeneration { return [.humanReview] }
        if stage == .humanReview { return [.customerReview, .approval] }
        if stage == .customerReview { return [.production, .approval] }
        if stage == .approval { return [.export] }
        if stage == .export { return [.delivery] }
        if stage == .delivery { return [.archived] }
        return []
    }

    static func allows(_ nextStage: RuntimeWorkflowStage, from currentStage: RuntimeWorkflowStage) -> Bool {
        nextStages(from: currentStage).contains(nextStage)
    }
}
