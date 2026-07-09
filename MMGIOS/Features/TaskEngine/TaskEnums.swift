import Foundation

enum ProductionTaskStatus: String, CaseIterable, Identifiable {
    case ready = "Ready"
    case inProgress = "In Progress"
    case blocked = "Blocked"
    case waitingForApproval = "Waiting for Approval"
    case completed = "Completed"
    case cancelled = "Cancelled"

    var id: String { rawValue }
}

enum ProductionTaskPriority: String, CaseIterable, Identifiable {
    case low = "Low"
    case normal = "Normal"
    case high = "High"
    case urgent = "Urgent"

    var id: String { rawValue }
}

enum ProductionDepartment: String, CaseIterable, Identifiable {
    case kairos = "Kairos"
    case editorial = "Editorial"
    case design = "Design"
    case publishing = "Publishing"
    case marketing = "Marketing"
    case customerSuccess = "Customer Success"
    case qualityAssurance = "Quality Assurance"

    var id: String { rawValue }
}
