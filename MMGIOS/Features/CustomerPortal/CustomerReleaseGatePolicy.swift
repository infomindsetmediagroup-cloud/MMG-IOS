import Foundation

struct CustomerReleaseGatePolicy {
    func evaluate(
        release: CustomerReleaseRecord,
        deliverables: [DeliverableRecord],
        productionAssets: [ProductionAssetRecord]
    ) -> CustomerReleaseGateReport {
        let deliverable = deliverables.first { $0.id == release.deliverableID }
        let asset = productionAssets.first { $0.id == release.assetID }

        let checks = [
            productionOnlyAssetCheck(asset: asset),
            approvalMetadataCheck(release: release, deliverable: deliverable, asset: asset),
            finalDeliverableScopeCheck(deliverable: deliverable),
            customerPublicationCheck(release: release)
        ]

        return CustomerReleaseGateReport(
            releaseID: release.id,
            releaseTitle: release.title,
            checks: checks
        )
    }

    private func productionOnlyAssetCheck(asset: ProductionAssetRecord?) -> CustomerReleaseGateCheckResult {
        guard let asset else {
            return .blocked(
                gate: .productionOnlyAssetCheck,
                message: "No production asset is linked to this release."
            )
        }

        guard asset.accessLevel == ProductionAssetAccessLevel.approvedDeliverable.rawValue else {
            return .blocked(
                gate: .productionOnlyAssetCheck,
                message: "Asset is still marked \(asset.accessLevel). Only approved deliverables may leave the production workspace."
            )
        }

        return .passed(
            gate: .productionOnlyAssetCheck,
            message: "Linked asset is approved for customer deliverable release."
        )
    }

    private func approvalMetadataCheck(
        release: CustomerReleaseRecord,
        deliverable: DeliverableRecord?,
        asset: ProductionAssetRecord?
    ) -> CustomerReleaseGateCheckResult {
        let missing = [
            release.approvedBy.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "release approver" : nil,
            deliverable?.approvedBy.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? nil : "deliverable approver",
            asset?.approvedBy.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? nil : "asset approver"
        ].compactMap { $0 }

        guard missing.isEmpty else {
            return .blocked(
                gate: .approvalMetadataCheck,
                message: "Missing approval metadata: \(missing.joined(separator: ", "))."
            )
        }

        return .passed(
            gate: .approvalMetadataCheck,
            message: "Release, deliverable, and asset approval metadata are present."
        )
    }

    private func finalDeliverableScopeCheck(deliverable: DeliverableRecord?) -> CustomerReleaseGateCheckResult {
        guard let deliverable else {
            return .blocked(
                gate: .finalDeliverableScopeCheck,
                message: "No final deliverable record is linked to this release."
            )
        }

        guard deliverable.releaseScope == DeliverableReleaseScope.approvedFinal.rawValue else {
            return .blocked(
                gate: .finalDeliverableScopeCheck,
                message: "Deliverable scope is \(deliverable.releaseScope), not Approved Final."
            )
        }

        let approvedStatuses = [DeliverableStatus.approved.rawValue, DeliverableStatus.released.rawValue]
        guard approvedStatuses.contains(deliverable.status) else {
            return .blocked(
                gate: .finalDeliverableScopeCheck,
                message: "Deliverable status is \(deliverable.status), not approved or released."
            )
        }

        guard !deliverable.storageLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .blocked(
                gate: .finalDeliverableScopeCheck,
                message: "Final deliverable has no storage location."
            )
        }

        return .passed(
            gate: .finalDeliverableScopeCheck,
            message: "Deliverable is final, approved, and has a storage location."
        )
    }

    private func customerPublicationCheck(release: CustomerReleaseRecord) -> CustomerReleaseGateCheckResult {
        guard release.status == CustomerReleaseStatus.published.rawValue else {
            return .blocked(
                gate: .customerPublicationCheck,
                message: "Release is \(release.status). It must be Published before customer access is complete."
            )
        }

        guard release.publishedAt != nil else {
            return .blocked(
                gate: .customerPublicationCheck,
                message: "Published release is missing a publication timestamp."
            )
        }

        guard !release.releaseLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .blocked(
                gate: .customerPublicationCheck,
                message: "Published release is missing a customer release location."
            )
        }

        return .passed(
            gate: .customerPublicationCheck,
            message: "Customer publication metadata is complete."
        )
    }
}

struct CustomerReleaseGateReport: Identifiable {
    let releaseID: String
    let releaseTitle: String
    let checks: [CustomerReleaseGateCheckResult]

    var id: String { releaseID }
    var isPassed: Bool { checks.allSatisfy(\.isPassed) }
    var blockedChecks: [CustomerReleaseGateCheckResult] { checks.filter { !$0.isPassed } }
    var summary: String {
        isPassed ? "Ready for customer release" : "Blocked by \(blockedChecks.count) gate check\(blockedChecks.count == 1 ? "" : "s")"
    }
}

struct CustomerReleaseGateCheckResult: Identifiable {
    let gate: CustomerReleaseGate
    let isPassed: Bool
    let message: String

    var id: String { gate.rawValue }

    static func passed(gate: CustomerReleaseGate, message: String) -> CustomerReleaseGateCheckResult {
        CustomerReleaseGateCheckResult(gate: gate, isPassed: true, message: message)
    }

    static func blocked(gate: CustomerReleaseGate, message: String) -> CustomerReleaseGateCheckResult {
        CustomerReleaseGateCheckResult(gate: gate, isPassed: false, message: message)
    }
}
