import Foundation
import SwiftData

@Model
final class TaskRecord {
    var id: String
    var workflowID: String
    var title: String
    var detail: String
    var department: String
    var assignee: String
    var status: String
    var priority: String
    var blocker: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        workflowID: String,
        title: String,
        detail: String,
        department: ProductionDepartment = .kairos,
        assignee: String = "Kairos",
        status: ProductionTaskStatus = .ready,
        priority: ProductionTaskPriority = .normal,
        blocker: String = ""
    ) {
        self.id = id
        self.workflowID = workflowID
        self.title = title
        self.detail = detail
        self.department = department.rawValue
        self.assignee = assignee
        self.status = status.rawValue
        self.priority = priority.rawValue
        self.blocker = blocker
        self.createdAt = .now
        self.updatedAt = .now
    }
}
