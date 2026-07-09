import Foundation
import SwiftData

@Model
final class DesignStudioProjectRecord {
    var id: String
    var customerName: String
    var title: String
    var summary: String
    var workflowID: String
    var taskID: String
    var queueID: String
    var knowledgeVaultID: String
    var status: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        customerName: String,
        title: String,
        summary: String,
        workflowID: String,
        taskID: String,
        queueID: String,
        knowledgeVaultID: String,
        status: String = "Active"
    ) {
        self.id = id
        self.customerName = customerName
        self.title = title
        self.summary = summary
        self.workflowID = workflowID
        self.taskID = taskID
        self.queueID = queueID
        self.knowledgeVaultID = knowledgeVaultID
        self.status = status
        self.createdAt = .now
        self.updatedAt = .now
    }
}
