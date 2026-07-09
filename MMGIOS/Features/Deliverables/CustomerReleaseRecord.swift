import Foundation
import SwiftData

@Model
final class CustomerReleaseRecord {
    var id: String
    var deliverableID: String
    var projectID: String
    var workflowID: String
    var taskID: String
    var assetID: String
    var title: String
    var summary: String
    var status: String
    var channel: String
    var version: Int
    var releaseLocation: String
    var approvedBy: String
    var approvalNotes: String
    var gateSummary: String
    var createdAt: Date
    var approvedAt: Date?
    var publishedAt: Date?
    var archivedAt: Date?
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        deliverableID: String,
        projectID: String,
        workflowID: String,
        taskID: String,
        assetID: String,
        title: String,
        summary: String,
        status: CustomerReleaseStatus = .draft,
        channel: CustomerReleaseChannel = .customerPortal,
        version: Int,
        releaseLocation: String,
        approvedBy: String = "",
        approvalNotes: String = "",
        gateSummary: String = ""
    ) {
        self.id = id
        self.deliverableID = deliverableID
        self.projectID = projectID
        self.workflowID = workflowID
        self.taskID = taskID
        self.assetID = assetID
        self.title = title
        self.summary = summary
        self.status = status.rawValue
        self.channel = channel.rawValue
        self.version = version
        self.releaseLocation = releaseLocation
        self.approvedBy = approvedBy
        self.approvalNotes = approvalNotes
        self.gateSummary = gateSummary
        self.createdAt = .now
        self.approvedAt = nil
        self.publishedAt = nil
        self.archivedAt = nil
        self.updatedAt = .now
    }
}
