import Foundation
import SwiftData

@Model
final class WorkflowRecord {
    var id: String
    var customer: String
    var projectID: String
    var projectTitle: String
    var type: String
    var stage: String
    var status: String
    var priority: String
    var owner: String
    var summary: String
    var progress: Int
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        customer: String,
        projectID: String,
        projectTitle: String,
        type: WorkflowType,
        stage: WorkflowStage = .intake,
        status: WorkflowStatus = .draft,
        priority: WorkflowPriority = .normal,
        owner: String = "Kairos",
        summary: String
    ) {
        self.id = id
        self.customer = customer
        self.projectID = projectID
        self.projectTitle = projectTitle
        self.type = type.rawValue
        self.stage = stage.rawValue
        self.status = status.rawValue
        self.priority = priority.rawValue
        self.owner = owner
        self.summary = summary
        self.progress = WorkflowStageProgress.percent(for: stage)
        self.createdAt = .now
        self.updatedAt = .now
    }
}
