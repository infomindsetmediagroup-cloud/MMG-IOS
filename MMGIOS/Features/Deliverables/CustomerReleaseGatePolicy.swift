import Foundation

struct CustomerReleaseGateResult: Identifiable {
    let gate: CustomerReleaseGate
    let passed: Bool
    let detail: String

    var id: String { gate.rawValue }
}

struct CustomerReleaseGateReport: Identifiable {
    let releaseID: String
    let results: [CustomerReleaseGateResult]

    var id: String { releaseID }
    var passed: Bool { results.allSatisfy(\.passed) }

    var summary: String {
        let passedCount = results.filter(\.passed).count
        return "\(passedCount)/\(results.count) release gates passed"
    }

    var blockingDetails: [String] {
        results.filter { !$0.passed }.map(\.detail)
    }
}

struct CustomerReleaseGatePolicy {
    func evaluate(_ release: CustomerReleaseRecord) -> CustomerReleaseGateReport {
        CustomerReleaseGateReport(
            releaseID: release.id,
            results: [
                productionOnlyAssetCheck(release),
                approvalMetadataCheck(release),
                finalDeliverableScopeCheck(release),
                customerPublicationCheck(release)
            ]
        )
    }

    func canPublish(_ release: CustomerReleaseRecord) -> Bool {
        evaluate(release).passed
    }

    private func productionOnlyAssetCheck(_ release: CustomerReleaseRecord) -> CustomerReleaseGateResult {
        let hasControlledLocation = release.releaseLocation.hasPrefix("portal-secure://")
        return CustomerReleaseGateResult(
            gate: .productionOnlyAssetCheck,
            passed: hasControlledLocation,
            detail: hasControlledLocation
                ? "Release uses controlled portal-secure access."
                : "Release must use portal-secure controlled access before customer publication."
        )
    }

    private func approvalMetadataCheck(_ release: CustomerReleaseRecord) -> CustomerReleaseGateResult {
        let approvedBy = release.approvedBy.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasApproval = !approvedBy.isEmpty && release.approvedAt != nil
        return CustomerReleaseGateResult(
            gate: .approvalMetadataCheck,
            passed: hasApproval,
            detail: hasApproval
                ? "Approval metadata is complete."
                : "Release requires approver identity and approval timestamp."
        )
    }

    private func finalDeliverableScopeCheck(_ release: CustomerReleaseRecord) -> CustomerReleaseGateResult {
        let hasDeliverable = !release.deliverableID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasProject = !release.projectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasTitle = !release.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let passed = hasDeliverable && hasProject && hasTitle && release.version > 0
        return CustomerReleaseGateResult(
            gate: .finalDeliverableScopeCheck,
            passed: passed,
            detail: passed
                ? "Final deliverable scope is complete."
                : "Release requires deliverable, project, title, and positive version metadata."
        )
    }

    private func customerPublicationCheck(_ release: CustomerReleaseRecord) -> CustomerReleaseGateResult {
        let isCustomerPortal = release.channel == CustomerReleaseChannel.customerPortal.rawValue
        let isApprovedOrPublished = release.status == CustomerReleaseStatus.approved.rawValue || release.status == CustomerReleaseStatus.published.rawValue
        let passed = isCustomerPortal && isApprovedOrPublished
        return CustomerReleaseGateResult(
            gate: .customerPublicationCheck,
            passed: passed,
            detail: passed
                ? "Release is approved for Customer Portal publication."
                : "Release must target Customer Portal and reach Approved status before publication."
        )
    }
}
