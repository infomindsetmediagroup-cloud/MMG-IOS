import Foundation
import SwiftData

@Model
final class ProductionAssetRecord {
    var id: String
    var projectID: String
    var workflowID: String
    var taskID: String
    var queueID: String
    var title: String
    var summary: String
    var assetType: String
    var status: String
    var accessLevel: String
    var version: Int
    var storageLocation: String
    var approvedBy: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        projectID: String,
        workflowID: String,
        taskID: String,
        queueID: String,
        title: String,
        summary: String,
        assetType: ProductionAssetType,
        status: ProductionAssetStatus = .draft,
        accessLevel: ProductionAssetAccessLevel = .internalOnly,
        version: Int = 1,
        storageLocation: String = "",
        approvedBy: String = ""
    ) {
        self.id = id
        self.projectID = projectID
        self.workflowID = workflowID
        self.taskID = taskID
        self.queueID = queueID
        self.title = title
        self.summary = summary
        self.assetType = assetType.rawValue
        self.status = status.rawValue
        self.accessLevel = accessLevel.rawValue
        self.version = version
        self.storageLocation = storageLocation
        self.approvedBy = approvedBy
        self.createdAt = .now
        self.updatedAt = .now
    }
}
