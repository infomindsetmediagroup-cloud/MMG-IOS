import Foundation
import SwiftData

@Model
final class DeliverableRecord {
    var id: String
    var projectID: String
    var workflowID: String
    var taskID: String
    var assetID: String
    var title: String
    var summary: String
    var deliverableType: String
    var status: String
    var releaseScope: String
    var version: Int
    var storageLocation: String
    var approvedBy: String
    var releasedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        projectID: String,
        workflowID: String,
        taskID: String,
        assetID: String,
        title: String,
        summary: String,
        deliverableType: DeliverableType,
        status: DeliverableStatus = .draft,
        releaseScope: DeliverableReleaseScope = .internalOnly,
        version: Int = 1,
        storageLocation: String = "",
        approvedBy: String = "",
        releasedAt: Date? = nil
    ) {
        self.id = id
        self.projectID = projectID
        self.workflowID = workflowID
        self.taskID = taskID
        self.assetID = assetID
        self.title = title
        self.summary = summary
        self.deliverableType = deliverableType.rawValue
        self.status = status.rawValue
        self.releaseScope = releaseScope.rawValue
        self.version = version
        self.storageLocation = storageLocation
        self.approvedBy = approvedBy
        self.releasedAt = releasedAt
        self.createdAt = .now
        self.updatedAt = .now
    }
}
