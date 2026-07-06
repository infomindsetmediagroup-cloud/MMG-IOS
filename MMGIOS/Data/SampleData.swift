import Foundation

enum SampleData {
    static let projects: [KairosProject] = [
        KairosProject(
            title: "Canonical Service Onboarding PDF",
            clientName: "MMG Internal",
            area: .publishing,
            status: .ready,
            priority: .critical,
            summary: "Revise the canonical onboarding PDF to route every service purchase into the Customer Portal workflow.",
            tasks: [
                KairosTask(title: "Confirm portal entry instructions"),
                KairosTask(title: "Replace placeholder onboarding text"),
                KairosTask(title: "Export and archive canonical PDF")
            ]
        ),
        KairosProject(
            title: "Production Command Center v1",
            clientName: "MMG Internal",
            area: .production,
            status: .inProgress,
            priority: .critical,
            summary: "Build the operational workspace for service fulfillment, project routing, and customer handoff control.",
            tasks: [
                KairosTask(title: "Model project workflow stages", isComplete: true),
                KairosTask(title: "Add project dashboard UI"),
                KairosTask(title: "Connect local persistence")
            ]
        ),
        KairosProject(
            title: "Quality & Release Center",
            clientName: "MMG Internal",
            area: .quality,
            status: .intake,
            priority: .high,
            summary: "Create QA gates, validation logs, and release-readiness controls for Kairos-managed deliverables.",
            tasks: [
                KairosTask(title: "Define release gate model"),
                KairosTask(title: "Create validation checklist UI"),
                KairosTask(title: "Add release notes structure")
            ]
        ),
        KairosProject(
            title: "Growth Campaign Registry",
            clientName: "MMG Internal",
            area: .growth,
            status: .ready,
            priority: .high,
            summary: "Establish campaign planning, promotion lifecycle, audience segmentation, and launch approval tracking.",
            tasks: [
                KairosTask(title: "Define campaign model"),
                KairosTask(title: "Add approval status tracking"),
                KairosTask(title: "Create promotion registry view")
            ]
        )
    ]

    static let customerRequests: [CustomerPortalRequest] = [
        CustomerPortalRequest(
            customerName: "MMG Demo Customer",
            email: "customer@example.com",
            requestType: .onboarding,
            status: .needsReview,
            subject: "Service onboarding started",
            message: "Customer has entered the portal and needs the standard service onboarding workflow reviewed."
        ),
        CustomerPortalRequest(
            customerName: "Publishing Client",
            email: "publishing@example.com",
            requestType: .manuscript,
            status: .received,
            subject: "Manuscript files submitted",
            message: "Customer submitted source files for publishing review and production routing."
        )
    ]

    static func releaseChecklists(for projects: [KairosProject]) -> [ReleaseChecklist] {
        projects.map { project in
            ReleaseChecklist(
                projectID: project.id,
                title: "\(project.title) Release Checklist",
                gates: defaultGates(),
                releaseNotes: "Initial release validation record for \(project.title)."
            )
        }
    }

    private static func defaultGates() -> [QualityGate] {
        [
            QualityGate(title: "Scope confirmed", detail: "The deliverable scope is documented and aligned to the active MMG doctrine."),
            QualityGate(title: "Content complete", detail: "All required customer-facing and internal content is present."),
            QualityGate(title: "Navigation validated", detail: "Critical links, page routes, and handoff paths have been checked."),
            QualityGate(title: "Release notes prepared", detail: "Release notes summarize the change, impact, and remaining risks."),
            QualityGate(title: "Approval captured", detail: "Human approval is recorded before external release or campaign launch.")
        ]
    }
}
