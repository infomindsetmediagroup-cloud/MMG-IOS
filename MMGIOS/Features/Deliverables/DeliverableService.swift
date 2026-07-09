import Foundation

struct DeliverableService {
    func createInitialDeliverables(from asset: ProductionAssetRecord) -> [DeliverableRecord] {
        [
            DeliverableRecord(
                projectID: asset.projectID,
                workflowID: asset.workflowID,
                taskID: asset.taskID,
                assetID: asset.id,
                title: "\(asset.title) Review Deliverable",
                summary: "Internal review package assembled from the approved production asset before customer release.",
                deliverableType: .exportPackage,
                status: .review,
                releaseScope: .customerPreview,
                storageLocation: "workspace://deliverables/assets/\(asset.id)/review-package"
            ),
            DeliverableRecord(
                projectID: asset.projectID,
                workflowID: asset.workflowID,
                taskID: asset.taskID,
                assetID: asset.id,
                title: "\(asset.title) Final Deliverable",
                summary: "Approved final deliverable retained under MMG/Kairos production control until explicitly released.",
                deliverableType: .printReadyFile,
                status: .draft,
                releaseScope: .internalOnly,
                storageLocation: "workspace://deliverables/assets/\(asset.id)/final-package"
            )
        ]
    }

    func approve(_ deliverable: DeliverableRecord, approver: String) {
        deliverable.status = DeliverableStatus.approved.rawValue
        deliverable.releaseScope = DeliverableReleaseScope.approvedFinal.rawValue
        deliverable.approvedBy = approver
        deliverable.updatedAt = .now
    }

    func release(_ deliverable: DeliverableRecord) {
        deliverable.status = DeliverableStatus.released.rawValue
        deliverable.releaseScope = DeliverableReleaseScope.approvedFinal.rawValue
        deliverable.releasedAt = .now
        deliverable.updatedAt = .now
    }
}
