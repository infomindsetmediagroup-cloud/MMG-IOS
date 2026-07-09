import Foundation
import SwiftData

@Model
final class ProductionQueueRecord {
    var id: String
    var workflowID: String
    var taskID: String
    var lane: String
    var status: String
    var priority: String
    var position: Int
    var summary: String
    var blocker: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        workflowID: String,
        taskID: String,
        lane: ProductionQueueLane,
        status: ProductionQueueStatus = .ready,
        priority: ProductionTaskPriority = .normal,
        position: Int = 0,
        summary: String,
        blocker: String = ""
    ) {
        self.id = id
        self.workflowID = workflowID
        self.taskID = taskID
        self.lane = lane.rawValue
        self.status = status.rawValue
        self.priority = priority.rawValue
        self.position = position
        self.summary = summary
        self.blocker = blocker
        self.createdAt = .now
        self.updatedAt = .now
    }
}
