import Foundation

struct CustomerReleaseGateAction: Identifiable {
    let title: String
    let detail: String
    let priority: String

    var id: String { "\(priority)-\(title)" }
}

struct CustomerReleaseGateActionAdvisor {
    func actions(for report: CustomerReleaseGateReport) -> [CustomerReleaseGateAction] {
        if report.passed {
            return [
                CustomerReleaseGateAction(
                    title: "Ready for controlled publication",
                    detail: "All gates passed. Release can proceed through the approved Customer Portal handoff path.",
                    priority: "P1"
                )
            ]
        }

        return report.results.compactMap { result in
            guard result.passed == false else { return nil }

            switch result.gate {
            case .productionOnlyAssetCheck:
                return CustomerReleaseGateAction(
                    title: "Move release to controlled portal storage",
                    detail: "Update the release location so customer access uses the portal-secure handoff path instead of exposing internal production material.",
                    priority: "P1"
                )
            case .approvalMetadataCheck:
                return CustomerReleaseGateAction(
                    title: "Complete approval metadata",
                    detail: "Add approver identity, approval timestamp, and approval notes before customer publication.",
                    priority: "P1"
                )
            case .finalDeliverableScopeCheck:
                return CustomerReleaseGateAction(
                    title: "Complete final deliverable scope",
                    detail: "Confirm deliverable, project, title, version, and final customer-facing package references.",
                    priority: "P1"
                )
            case .customerPublicationCheck:
                return CustomerReleaseGateAction(
                    title: "Move release to approved Customer Portal state",
                    detail: "Confirm the release channel is Customer Portal and the status has reached Approved before publication.",
                    priority: "P1"
                )
            }
        }
    }
}
