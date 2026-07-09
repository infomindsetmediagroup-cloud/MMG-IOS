import Foundation

struct ProductionAssetService {
    func createInitialAssets(for project: DesignStudioProjectRecord) -> [ProductionAssetRecord] {
        [
            ProductionAssetRecord(
                projectID: project.id,
                workflowID: project.workflowID,
                taskID: project.taskID,
                queueID: project.queueID,
                title: "\(project.title) Source Document",
                summary: "Primary editable production document retained inside the MMG/Kairos workspace.",
                assetType: .document,
                status: .inProduction,
                accessLevel: .internalOnly,
                storageLocation: "workspace://design-studio/projects/\(project.id)/source-document"
            ),
            ProductionAssetRecord(
                projectID: project.id,
                workflowID: project.workflowID,
                taskID: project.taskID,
                queueID: project.queueID,
                title: "\(project.title) Export Package",
                summary: "Approved final deliverable package prepared only after production review.",
                assetType: .exportPackage,
                status: .needsReview,
                accessLevel: .customerWorkspace,
                storageLocation: "workspace://design-studio/projects/\(project.id)/export-package"
            )
        ]
    }

    func markNeedsReview(_ asset: ProductionAssetRecord) {
        asset.status = ProductionAssetStatus.needsReview.rawValue
        asset.updatedAt = .now
    }

    func approve(_ asset: ProductionAssetRecord, approver: String) {
        asset.status = ProductionAssetStatus.approved.rawValue
        asset.accessLevel = ProductionAssetAccessLevel.approvedDeliverable.rawValue
        asset.approvedBy = approver
        asset.updatedAt = .now
    }

    func markExportReady(_ asset: ProductionAssetRecord) {
        asset.status = ProductionAssetStatus.exportReady.rawValue
        asset.accessLevel = ProductionAssetAccessLevel.approvedDeliverable.rawValue
        asset.updatedAt = .now
    }
}
