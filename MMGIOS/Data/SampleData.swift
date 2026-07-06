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

    static let publishingAssets: [PublishingAsset] = [
        PublishingAsset(
            title: "Canonical Service Onboarding PDF",
            assetType: .onboardingPDF,
            status: .inProduction,
            canonicalPath: "/assets/mmg-service-onboarding.pdf",
            summary: "Canonical PDF for every MMG service purchase, directing customers into the Customer Portal."
        ),
        PublishingAsset(
            title: "AI Prompting for Beginners Product Page",
            assetType: .shopifyPage,
            status: .qa,
            canonicalPath: "/products/ai-prompting-for-beginners",
            summary: "Standard product page using the approved single-variant product framework."
        ),
        PublishingAsset(
            title: "The Creator's Bible",
            assetType: .book,
            status: .published,
            canonicalPath: "/products/the-creators-bible",
            summary: "Flagship creator education book and catalog anchor."
        ),
        PublishingAsset(
            title: "Editorial Publishing Engine Article Queue",
            assetType: .article,
            status: .drafted,
            canonicalPath: "/blogs/knowledge-library",
            summary: "Production-ready Shopify article pipeline for MMG editorial publishing."
        )
    ]

    static let releasePackages: [ReleasePackage] = [
        ReleasePackage(
            title: "Canonical Service Onboarding PDF v1 Release",
            status: .readyForReview,
            summary: "Release package for the canonical onboarding PDF update and Customer Portal routing standard.",
            customerImpact: "Customers receive one clear onboarding path after any MMG service purchase.",
            internalNotes: "Confirm portal URL, service workflow language, and canonical file naming before ship.",
            validationSummary: "Requires scope, content, navigation, release notes, and approval validation."
        ),
        ReleasePackage(
            title: "Production Command Center v1 Internal Release",
            status: .draft,
            summary: "Internal release package for the Production Command Center vertical slice.",
            customerImpact: "Improves delivery tracking and service-production reliability.",
            internalNotes: "Ship internally before exposing production-state visibility to customers.",
            validationSummary: "Pending production workflow QA and release gate review."
        )
    ]

    static let campaigns: [Campaign] = [
        Campaign(
            title: "Creator Education Starter Campaign",
            status: .review,
            channel: .email,
            audience: .newCreators,
            objective: "Move new creators into the AI Prompting for Beginners product path.",
            offer: "Starter education bundle positioning with direct product CTA.",
            landingPagePath: "/products/ai-prompting-for-beginners",
            promoCode: PromoCode(code: "STARTER10", discountDescription: "10% off starter creator education products", usageLimit: 100),
            requiresApproval: true
        ),
        Campaign(
            title: "Publishing Services Awareness Push",
            status: .draft,
            channel: .landingPage,
            audience: .authors,
            objective: "Introduce authors to MMG service onboarding and portal-first publishing support.",
            offer: "Publishing workflow consultation and service onboarding path.",
            landingPagePath: "/pages/publishing-services",
            requiresApproval: true
        )
    ]

    static let intelligenceItems: [IntelligenceItem] = [
        IntelligenceItem(
            title: "Release gate needs validation",
            sourceName: "Quality & Release Center",
            itemType: .quality,
            status: .reviewing,
            confidence: .high,
            summary: "A release record is waiting on scope, navigation, release notes, and approval validation before shipment.",
            recommendation: "Open the release checklist, complete required gates, then move the package into ready-for-review status."
        ),
        IntelligenceItem(
            title: "Campaign launch requires approval",
            sourceName: "Growth Engine",
            itemType: .growth,
            status: .detected,
            confidence: .high,
            summary: "A campaign can be prepared internally, but external launch remains blocked until human approval is recorded.",
            recommendation: "Review campaign objective, offer, audience, and landing path before marking the item approved."
        ),
        IntelligenceItem(
            title: "Portal-first onboarding dependency",
            sourceName: "Customer Portal",
            itemType: .customer,
            status: .detected,
            confidence: .medium,
            summary: "Service onboarding assets should continue routing customer work into the portal before production starts.",
            recommendation: "Confirm the onboarding PDF, portal copy, and project intake language are aligned before release."
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
