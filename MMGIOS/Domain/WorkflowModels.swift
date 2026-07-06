import Foundation

enum WorkflowArea: String, CaseIterable, Codable, Identifiable {
    case admin = "Admin"
    case publishing = "Publishing"
    case production = "Production"
    case quality = "Quality"
    case growth = "Growth"
    case automation = "Automation"

    var id: String { rawValue }
}

enum WorkflowStatus: String, CaseIterable, Codable, Identifiable {
    case intake = "Intake"
    case ready = "Ready"
    case inProgress = "In Progress"
    case review = "Review"
    case blocked = "Blocked"
    case complete = "Complete"

    var id: String { rawValue }
}

enum WorkflowPriority: String, CaseIterable, Codable, Identifiable {
    case critical = "Critical"
    case high = "High"
    case standard = "Standard"
    case low = "Low"

    var id: String { rawValue }
}

struct KairosProject: Identifiable, Codable, Hashable {
    var id: UUID
    var title: String
    var clientName: String
    var area: WorkflowArea
    var status: WorkflowStatus
    var priority: WorkflowPriority
    var summary: String
    var createdAt: Date
    var updatedAt: Date
    var dueDate: Date?
    var tasks: [KairosTask]

    init(
        id: UUID = UUID(),
        title: String,
        clientName: String,
        area: WorkflowArea,
        status: WorkflowStatus,
        priority: WorkflowPriority,
        summary: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        dueDate: Date? = nil,
        tasks: [KairosTask] = []
    ) {
        self.id = id
        self.title = title
        self.clientName = clientName
        self.area = area
        self.status = status
        self.priority = priority
        self.summary = summary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.dueDate = dueDate
        self.tasks = tasks
    }
}

struct KairosTask: Identifiable, Codable, Hashable {
    var id: UUID
    var title: String
    var isComplete: Bool
    var owner: String
    var notes: String

    init(id: UUID = UUID(), title: String, isComplete: Bool = false, owner: String = "MMG", notes: String = "") {
        self.id = id
        self.title = title
        self.isComplete = isComplete
        self.owner = owner
        self.notes = notes
    }
}
