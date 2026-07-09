import Foundation

struct CustomerReleaseApprovalInput {
    let approvedBy: String
    let approvalNotes: String
    let releaseLocation: String

    init(approvedBy: String, approvalNotes: String, releaseLocation: String) {
        self.approvedBy = approvedBy
        self.approvalNotes = approvalNotes
        self.releaseLocation = releaseLocation
    }
}

struct CustomerReleaseCoordinator {
    private let gatePolicy = CustomerReleaseGatePolicy()

    func makeDraftRelease(from deliverable: DeliverableRecord, channel: CustomerReleaseChannel = .customerPortal) -> CustomerReleaseRecord {
        CustomerReleaseRecord(
            deliverableID: deliverable.id,
            projectID: deliverable.projectID,
            workflowID: deliverable.workflowID,
            taskID: deliverable.taskID,
            assetID: deliverable.assetID,
            title: deliverable.title,
            summary: deliverable.summary,
            status: .draft,
            channel: channel,
            version: deliverable.version,
            releaseLocation: controlledPortalLocation(for: deliverable)
        )
    }

    func approve(_ release: CustomerReleaseRecord, input: CustomerReleaseApprovalInput) {
        release.status = CustomerReleaseStatus.approved.rawValue
        release.approvedBy = input.approvedBy.trimmingCharacters(in: .whitespacesAndNewlines)
        release.approvalNotes = input.approvalNotes.trimmingCharacters(in: .whitespacesAndNewlines)
        release.releaseLocation = normalizedSecureLocation(input.releaseLocation, release: release)
        release.approvedAt = .now
        release.updatedAt = .now
        release.gateSummary = gatePolicy.evaluate(release).summary
    }

    func publish(_ release: CustomerReleaseRecord) -> CustomerReleaseGateReport {
        let report = gatePolicy.evaluate(release)
        release.gateSummary = report.passed ? report.summary : report.blockingDetails.joined(separator: " ")
        release.updatedAt = .now

        if report.passed {
            release.status = CustomerReleaseStatus.published.rawValue
            release.publishedAt = .now
        }

        return report
    }

    func archive(_ release: CustomerReleaseRecord) {
        release.status = CustomerReleaseStatus.archived.rawValue
        release.archivedAt = .now
        release.updatedAt = .now
    }

    private func controlledPortalLocation(for deliverable: DeliverableRecord) -> String {
        "portal-secure://projects/\(deliverable.projectID)/deliverables/\(deliverable.id)/v\(deliverable.version)"
    }

    private func normalizedSecureLocation(_ candidate: String, release: CustomerReleaseRecord) -> String {
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("portal-secure://") { return trimmed }
        return "portal-secure://projects/\(release.projectID)/deliverables/\(release.deliverableID)/v\(release.version)"
    }
}
