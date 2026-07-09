import Foundation

struct CustomerReleaseSeedFactory {
    func makeSampleDeliverables() -> [DeliverableRecord] {
        [
            DeliverableRecord(
                id: "sample-deliverable-approved-final",
                projectID: "sample-project-customer-portal",
                workflowID: "sample-workflow-release",
                taskID: "sample-task-final-package",
                assetID: "sample-asset-final-pdf",
                title: "Approved Final Customer Portal Package",
                summary: "Final customer-facing package approved for controlled portal publication.",
                deliverableType: .exportPackage,
                status: .approved,
                releaseScope: .approvedFinal,
                version: 1,
                storageLocation: "mmg-secure://deliverables/customer-portal/final-package-v1",
                approvedBy: "Kairos Runtime"
            ),
            DeliverableRecord(
                id: "sample-deliverable-internal-draft",
                projectID: "sample-project-design-studio",
                workflowID: "sample-workflow-production",
                taskID: "sample-task-draft-assets",
                assetID: "sample-asset-layered-source",
                title: "Internal Design Studio Draft Assets",
                summary: "Intermediate editable assets retained inside the MMG/Kairos production workspace.",
                deliverableType: .marketingAsset,
                status: .review,
                releaseScope: .internalOnly,
                version: 1,
                storageLocation: "mmg-secure://production/design-studio/internal-draft-assets",
                approvedBy: ""
            ),
            DeliverableRecord(
                id: "sample-deliverable-preview-blocked",
                projectID: "sample-project-preview",
                workflowID: "sample-workflow-preview",
                taskID: "sample-task-preview-package",
                assetID: "sample-asset-preview-package",
                title: "Customer Preview Package Missing Approval",
                summary: "Preview package intentionally blocked until final approval metadata is complete.",
                deliverableType: .digitalProduct,
                status: .approved,
                releaseScope: .customerPreview,
                version: 1,
                storageLocation: "mmg-secure://deliverables/customer-preview/package-v1",
                approvedBy: ""
            )
        ]
    }

    func makeSampleReleases() -> [CustomerReleaseRecord] {
        [
            CustomerReleaseRecord(
                id: "sample-release-blocked-metadata",
                deliverableID: "sample-deliverable-blocked-metadata",
                projectID: "sample-project-blocked",
                workflowID: "sample-workflow-blocked",
                taskID: "sample-task-blocked",
                assetID: "sample-asset-blocked",
                title: "Blocked Release — Missing Approval Metadata",
                summary: "Release is staged but blocked because approval metadata is incomplete.",
                status: .internalReview,
                channel: .customerPortal,
                version: 1,
                releaseLocation: "portal-secure://projects/sample-project-blocked/deliverables/sample-deliverable-blocked-metadata/v1",
                gateSummary: "Approval metadata required before customer publication."
            ),
            approvedRelease(),
            publishedRelease()
        ]
    }

    private func approvedRelease() -> CustomerReleaseRecord {
        let release = CustomerReleaseRecord(
            id: "sample-release-approved-ready",
            deliverableID: "sample-deliverable-approved-final",
            projectID: "sample-project-customer-portal",
            workflowID: "sample-workflow-release",
            taskID: "sample-task-final-package",
            assetID: "sample-asset-final-pdf",
            title: "Approved Release — Ready To Publish",
            summary: "Approved final deliverable is ready for controlled Customer Portal publication.",
            status: .approved,
            channel: .customerPortal,
            version: 1,
            releaseLocation: "portal-secure://projects/sample-project-customer-portal/deliverables/sample-deliverable-approved-final/v1",
            gateSummary: "All customer release gates clear."
        )
        release.approvedBy = "Kairos Runtime"
        release.approvalNotes = "Approved sample release for controlled customer portal publication."
        release.approvedAt = .now
        return release
    }

    private func publishedRelease() -> CustomerReleaseRecord {
        let release = CustomerReleaseRecord(
            id: "sample-release-published",
            deliverableID: "sample-deliverable-published",
            projectID: "sample-project-published",
            workflowID: "sample-workflow-published",
            taskID: "sample-task-published",
            assetID: "sample-asset-published",
            title: "Published Release — Customer Portal",
            summary: "Sample release already published to controlled Customer Portal access.",
            status: .published,
            channel: .customerPortal,
            version: 1,
            releaseLocation: "portal-secure://projects/sample-project-published/deliverables/sample-deliverable-published/v1",
            gateSummary: "Published release remains separated from staged releases."
        )
        release.approvedBy = "Kairos Runtime"
        release.approvalNotes = "Approved and published sample release."
        release.approvedAt = .now
        release.publishedAt = .now
        return release
    }
}
