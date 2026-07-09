import Foundation

enum ProductionQueueStatus: String, CaseIterable, Identifiable {
    case ready = "Ready"
    case active = "Active"
    case blocked = "Blocked"
    case retry = "Retry"
    case completed = "Completed"

    var id: String { rawValue }
}

enum ProductionQueueLane: String, CaseIterable, Identifiable {
    case intake = "Intake"
    case editorial = "Editorial"
    case design = "Design"
    case publishing = "Publishing"
    case marketing = "Marketing"
    case approvals = "Approvals"
    case delivery = "Delivery"

    var id: String { rawValue }
}
