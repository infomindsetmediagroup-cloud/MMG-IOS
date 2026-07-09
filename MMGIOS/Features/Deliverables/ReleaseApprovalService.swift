import Foundation

struct ReleaseApprovalService {
    func createDraftRelease(from deliverable: DeliverableRecord) -> CustomerReleaseRecord? {
        guard canCreateRelease(from: deliverable) else { return nil }

        return CustomerReleaseRecord(
            deliverableID: deliverable.id,
            projectID: deliverable.projectID,
            workflowID: deliverable.workflowID,
            taskID: deliverable.taskID,
            assetID: deliverable.assetID,
            title: "\(deliverable.title) Customer Release",
            summary: "Customer-facing release record generated from an approved final deliverable. Intermediate assets remain inside MMG/Kairos production control.",
            status: .internalReview,
            channel: .customerPortal,
            version: deliverable.version,
            releaseLocation: "workspace://customer-releases/deliverables/\(deliverable.id)/v\(deliverable.version)",
            gateSummary: releaseGateSummary(for: deliverable)
        )
    }

    func approve(_ release: CustomerReleaseRecord, approver: String, notes: String) {
        release.status = CustomerReleaseStatus.approved.rawValue
        release.approvedBy = approver
        release.approvalNotes = notes
        release.approvedAt = .now
        release.updatedAt = .now
    }

    func publish(_ release: CustomerReleaseRecord) {
        guard release.status == CustomerReleaseStatus.approved.rawValue else { return }
        release.status = CustomerReleaseStatus.published.rawValue
        release.publishedAt = .now
        release.updatedAt = .now
    }

    func archive(_ release: CustomerReleaseRecord) {
        release.status = CustomerReleaseStatus.archived.rawValue
        release.archivedAt = .now
        release.updatedAt = .now
    }

    func canCreateRelease(from deliverable: DeliverableRecord) -> Bool {
        deliverable.status == DeliverableStatus.approved.rawValue
            && deliverable.releaseScope == DeliverableReleaseScope.approvedFinal.rawValue
            && !deliverable.approvedBy.isEmpty
    }

    private func releaseGateSummary(for deliverable: DeliverableRecord) -> String {
        [
            CustomerReleaseGate.productionOnlyAssetCheck.rawValue,
            CustomerReleaseGate.approvalMetadataCheck.rawValue,
            CustomerReleaseGate.finalDeliverableScopeCheck.rawValue,
            CustomerReleaseGate.customerPublicationCheck.rawValue
        ].joined(separator: " • ") + " complete for \(deliverable.title)."
    }
}
