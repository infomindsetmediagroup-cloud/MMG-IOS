import Foundation

struct WorkflowStageProgress {
    static func percent(for stage: WorkflowStage) -> Int {
        if stage == .intake { return 5 }
        if stage == .planning { return 15 }
        if stage == .production { return 35 }
        if stage == .aiGeneration { return 40 }
        if stage == .humanReview { return 55 }
        if stage == .customerReview { return 65 }
        if stage == .approval { return 75 }
        if stage == .export { return 85 }
        if stage == .delivery { return 95 }
        return 100
    }
}
