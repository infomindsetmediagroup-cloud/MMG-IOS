import Foundation

enum WorkflowType: String, CaseIterable, Identifiable {
    case publishing = "Publishing"
    case designStudio = "Design Studio"
    case marketing = "Marketing"
    case website = "Website"
    case customerSuccess = "Customer Success"
    case kairosOrchestration = "Kairos Orchestration"

    var id: String { rawValue }
}

enum WorkflowStage: String, CaseIterable, Identifiable {
    case intake = "Intake"
    case planning = "Planning"
    case production = "Production"
    case aiGeneration = "AI Generation"
    case humanReview = "Human Review"
    case customerReview = "Customer Review"
    case approval = "Approval"
    case export = "Export"
    case delivery = "Delivery"
    case archived = "Archived"

    var id: String { rawValue }
}

enum WorkflowStatus: String, CaseIterable, Identifiable {
    case draft = "Draft"
    case active = "Active"
    case blocked = "Blocked"
    case waitingForApproval = "Waiting for Approval"
    case completed = "Completed"
    case archived = "Archived"
    case cancelled = "Cancelled"

    var id: String { rawValue }
}

enum WorkflowPriority: String, CaseIterable, Identifiable {
    case low = "Low"
    case normal = "Normal"
    case high = "High"
    case urgent = "Urgent"

    var id: String { rawValue }
}
