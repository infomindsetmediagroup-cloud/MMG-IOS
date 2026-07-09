import Foundation
import SwiftData

@Model
final class TaskDependencyRecord {
    var id: String
    var taskID: String
    var dependsOnTaskID: String
    var createdAt: Date

    init(
        id: String = UUID().uuidString,
        taskID: String,
        dependsOnTaskID: String
    ) {
        self.id = id
        self.taskID = taskID
        self.dependsOnTaskID = dependsOnTaskID
        self.createdAt = .now
    }
}
