import Foundation
import SwiftData

@Model
final class WorkflowTransitionRecord {
    var id: String
    var workflowID: String
    var fromStage: String
    var toStage: String
    var fromStatus: String
    var toStatus: String
    var actor: String
    var trigger: String
    var notes: String
    var createdAt: Date

    init(
        id: String = UUID().uuidString,
        workflowID: String,
        fromStage: RuntimeWorkflowStage,
        toStage: RuntimeWorkflowStage,
        fromStatus: RuntimeWorkflowStatus,
        toStatus: RuntimeWorkflowStatus,
        actor: String,
        trigger: String,
        notes: String = ""
    ) {
        self.id = id
        self.workflowID = workflowID
        self.fromStage = fromStage.rawValue
        self.toStage = toStage.rawValue
        self.fromStatus = fromStatus.rawValue
        self.toStatus = toStatus.rawValue
        self.actor = actor
        self.trigger = trigger
        self.notes = notes
        self.createdAt = .now
    }
}
