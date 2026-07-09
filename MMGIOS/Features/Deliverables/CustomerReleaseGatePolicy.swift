import Foundation

struct CustomerReleaseGatePolicy {
    func evaluate(asset: ProductionAssetRecord, deliverable: DeliverableRecord, release: CustomerReleaseRecord) -> CustomerReleaseGateReport {
        var checks: [CustomerReleaseGateCheck] = []

        checks.append(
            CustomerReleaseGateCheck(
                gate: .productionOnlyAssetCheck,
                passed: asset.accessLevel == ProductionAssetAccessLevel.approvedDeliverable.rawValue,
                detail: asset.accessLevel == ProductionAssetAccessLevel.approvedDeliverable.rawValue
                    ? "Asset is marked as an approved deliverable."
                    : "Asset remains restricted inside the MMG/Kairos production workspace."
            )
        )

        checks.append(
            CustomerReleaseGateCheck(
                gate: .approvalMetadataCheck,
                passed: !deliverable.approvedBy.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                detail: deliverable.approvedBy.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? "Deliverable is missing approval authority metadata."
                    : "Deliverable approval authority is recorded."
            )
        )

        checks.append(
            CustomerReleaseGateCheck(
                gate: .finalDeliverableScopeCheck,
                passed: deliverable.releaseScope == DeliverableReleaseScope.approvedFinal.rawValue && deliverable.status == DeliverableStatus.approved.rawValue,
                detail: deliverable.releaseScope == DeliverableReleaseScope.approvedFinal.rawValue && deliverable.status == DeliverableStatus.approved.rawValue
                    ? "Deliverable is approved as a final release package."
                    : "Deliverable is not yet approved for final customer release."
            )
        )

        checks.append(
            CustomerReleaseGateCheck(
                gate: .customerPublicationCheck,
                passed: release.channel == CustomerReleaseChannel.customerPortal.rawValue || release.channel == CustomerReleaseChannel.privateDownload.rawValue,
                detail: "Release channel: \(release.channel)."
            )
        )

        return CustomerReleaseGateReport(checks: checks)
    }
}

struct CustomerReleaseGateReport: Identifiable, Hashable {
    let id = UUID()
    var checks: [CustomerReleaseGateCheck]

    var isApproved: Bool { checks.allSatisfy(\.passed) }

    var summary: String {
        let passedCount = checks.filter(\.passed).count
        return "\(passedCount)/\(checks.count) release gates passed"
    }

    var blockingDetails: [String] {
        checks.filter { !$0.passed }.map(\.detail)
    }
}

struct CustomerReleaseGateCheck: Identifiable, Hashable {
    let id = UUID()
    var gate: CustomerReleaseGate
    var passed: Bool
    var detail: String
}
