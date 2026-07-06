import Foundation
import Observation

@Observable
final class KairosRuntime {
    var state: KairosRuntimeState
    var criticalPath: [KairosRuntimeWorkItem]
    var engineStatuses: [KairosEngineStatus]
    var workflowSteps: [KairosWorkflowStep]
    var operatorActions: [KairosOperatorAction]
    var shopifyWorkspaces: [KairosOperatorAction]
    var shopifyPipeline: [KairosRuntimeWorkItem]
    var productQueue: [KairosProductQueueItem]
    var connectedEngines: [KairosEngineStatus]
    var dailyRun: [KairosWorkflowStep]
    var automationQueue: [KairosRuntimeWorkItem]
    var approvalQueue: [KairosApprovalQueueItem]
    var eventLog: [KairosWorkflowEvent]

    init(seed: Bool = true) {
        state = KairosRuntimeState.seed
        criticalPath = []
        engineStatuses = []
        workflowSteps = []
        operatorActions = []
        shopifyWorkspaces = []
        shopifyPipeline = []
        productQueue = []
        connectedEngines = []
        dailyRun = []
        automationQueue = []
        approvalQueue = []
        eventLog = []

        if seed {
            loadSeedState()
        }
    }

    func startDailyOperations() {
        state.activeWorkflow = "Daily Operations Run"
        recordEvent(.operationsStarted, title: "Daily operations started", detail: "Kairos loaded the current runtime queue and selected the next executable work path.")
    }

    func markCriticalPathItemComplete(_ item: KairosRuntimeWorkItem) {
        guard let index = criticalPath.firstIndex(where: { $0.id == item.id }) else { return }
        criticalPath[index].status = .complete
        criticalPath[index].progress = 1.0
        recalculateReadiness()
        recordEvent(.workCompleted, title: "Completed \(item.title)", detail: item.detail)
    }

    func requestApproval(_ item: KairosApprovalQueueItem) {
        approvalQueue.append(item)
        recordEvent(.approvalRequested, title: item.title, detail: item.detail)
    }

    func recordEvent(_ type: KairosWorkflowEvent.EventType, title: String, detail: String) {
        eventLog.insert(KairosWorkflowEvent(type: type, title: title, detail: detail), at: 0)
        state.updatedAt = Date()
    }

    private func recalculateReadiness() {
        let completed = criticalPath.filter { $0.status == .complete }.count
        let total = max(criticalPath.count, 1)
        state.readiness = Double(completed) / Double(total)
    }

    private func loadSeedState() {
        criticalPath = [
            KairosRuntimeWorkItem(title: "Operations Dashboard", category: .dashboard, priority: .critical, status: .complete, detail: "Unified Build Mode command surface.", systemImage: "rectangle.3.group", progress: 1.0),
            KairosRuntimeWorkItem(title: "Shopify Operations Engine", category: .shopify, priority: .critical, status: .processing, detail: "Products, pages, collections, pricing, vault access, and publishing flow.", systemImage: "cart.badge.plus", progress: 0.55),
            KairosRuntimeWorkItem(title: "Operational Orchestrator", category: .orchestration, priority: .critical, status: .queued, detail: "End-to-end workflow controller.", systemImage: "arrow.triangle.branch", progress: 0.35),
            KairosRuntimeWorkItem(title: "Golden Master Generator", category: .release, priority: .critical, status: .queued, detail: "Backup, release archive, and recovery package.", systemImage: "archivebox", progress: 0.10)
        ]

        engineStatuses = [
            KairosEngineStatus(title: "Knowledge Bank", state: "Defined", health: .healthy, systemImage: "brain"),
            KairosEngineStatus(title: "Product Engine", state: "Defined", health: .healthy, systemImage: "shippingbox"),
            KairosEngineStatus(title: "Pricing Engine", state: "Defined", health: .healthy, systemImage: "dollarsign.circle"),
            KairosEngineStatus(title: "System Vault", state: "Defined", health: .healthy, systemImage: "lock.rectangle.stack"),
            KairosEngineStatus(title: "White-Label", state: "Defined", health: .healthy, systemImage: "wand.and.stars"),
            KairosEngineStatus(title: "Licensing", state: "Defined", health: .healthy, systemImage: "doc.text"),
            KairosEngineStatus(title: "Deployment", state: "Defined", health: .attention, systemImage: "server.rack"),
            KairosEngineStatus(title: "Autonomy", state: "Phase 1", health: .healthy, systemImage: "sparkles")
        ]

        workflowSteps = [
            KairosWorkflowStep(title: "Capture", detail: "Receive idea, asset, research item, service, or product concept.", systemImage: "tray.and.arrow.down"),
            KairosWorkflowStep(title: "Classify", detail: "Assign knowledge category, product class, license eligibility, and vault destination.", systemImage: "tag"),
            KairosWorkflowStep(title: "Manufacture", detail: "Generate product assets, guide, pricing record, metadata, and workflow package.", systemImage: "gearshape.2"),
            KairosWorkflowStep(title: "Validate", detail: "Check quality, pricing, branding, white-label status, Shopify readiness, and licensing.", systemImage: "checkmark.seal"),
            KairosWorkflowStep(title: "Publish", detail: "Prepare Shopify listing, Knowledge Library entry, System Vault entitlement, and release record.", systemImage: "paperplane")
        ]

        operatorActions = [
            KairosOperatorAction(title: "Start Daily Ops", detail: "Invoke current operating queue.", systemImage: "play.circle"),
            KairosOperatorAction(title: "Build Product", detail: "Run manufacturing pipeline.", systemImage: "plus.square.on.square"),
            KairosOperatorAction(title: "Price Asset", detail: "Apply canonical pricing ladder.", systemImage: "tag"),
            KairosOperatorAction(title: "Prepare Shopify", detail: "Generate listing materials.", systemImage: "bag"),
            KairosOperatorAction(title: "Vault Package", detail: "Create customer access bundle.", systemImage: "lock.doc"),
            KairosOperatorAction(title: "Release Check", detail: "Validate before publication.", systemImage: "checkmark.seal")
        ]

        shopifyWorkspaces = [
            KairosOperatorAction(title: "Products", detail: "Create, stage, price, and package digital products, books, services, and licenses.", systemImage: "shippingbox"),
            KairosOperatorAction(title: "Collections", detail: "Group products by series, system, module, license, and customer journey.", systemImage: "square.grid.3x3"),
            KairosOperatorAction(title: "Pages", detail: "Prepare public pages, portal pages, Knowledge Library areas, and sales pages.", systemImage: "doc.richtext"),
            KairosOperatorAction(title: "Navigation", detail: "Control canonical menus, pathways, cross-links, and customer routes.", systemImage: "point.topleft.down.curvedto.point.bottomright.up"),
            KairosOperatorAction(title: "SEO", detail: "Generate titles, descriptions, structured product metadata, and internal links.", systemImage: "magnifyingglass"),
            KairosOperatorAction(title: "Publishing", detail: "Hold publication until approval, validation, and release package readiness.", systemImage: "paperplane")
        ]

        shopifyPipeline = [
            KairosRuntimeWorkItem(title: "Manufacture Product", category: .product, priority: .high, status: .processing, detail: "Create product package through the Product Manufacturing Engine.", systemImage: "shippingbox", progress: 0.35),
            KairosRuntimeWorkItem(title: "Assign Pricing", category: .pricing, priority: .high, status: .queued, detail: "Apply Pricing Intelligence rules and store the Pricing Record.", systemImage: "tag", progress: 0.20),
            KairosRuntimeWorkItem(title: "Generate Listing", category: .shopify, priority: .high, status: .queued, detail: "Produce title, description, images, SEO, customer guide, and cross-sells.", systemImage: "doc.richtext", progress: 0.10),
            KairosRuntimeWorkItem(title: "Assign Vault Access", category: .vault, priority: .high, status: .queued, detail: "Map product to Free Vault, purchased assets, modules, systems, or licenses.", systemImage: "lock.rectangle.stack", progress: 0.0),
            KairosRuntimeWorkItem(title: "Validate Release", category: .release, priority: .critical, status: .queued, detail: "Check branding, white-label status, links, metadata, and publication readiness.", systemImage: "checkmark.seal", progress: 0.0)
        ]

        productQueue = [
            KairosProductQueueItem(title: "Entrepreneur Operating System", productType: "System", detail: "Flagship accessible business-building package with modules, guides, SOPs, templates, and vault access.", tags: ["$199.95", "System", "Vault"]),
            KairosProductQueueItem(title: "AI Business OS Replication Package", productType: "Premium", detail: "Instruction-set package for customers building their own AI-assisted business operating system.", tags: ["$299.95+", "AI OS", "License"]),
            KairosProductQueueItem(title: "KDP-Ready Knowledge Asset", productType: "Download", detail: "Customer-facing book package with interior, cover, product guide, and implementation materials.", tags: ["$39.95+", "KDP", "Guide"]),
            KairosProductQueueItem(title: "Commercial License", productType: "License", detail: "White-label rights package for derivative branded systems without MMG branding.", tags: ["$399.95", "Rights", "White-Label"])
        ]

        connectedEngines = [
            KairosEngineStatus(title: "Knowledge Bank", state: "Source", health: .healthy, systemImage: "brain"),
            KairosEngineStatus(title: "Pricing Engine", state: "Rules", health: .healthy, systemImage: "tag"),
            KairosEngineStatus(title: "Product Engine", state: "Manufacturing", health: .healthy, systemImage: "gearshape.2"),
            KairosEngineStatus(title: "System Vault", state: "Entitlements", health: .healthy, systemImage: "lock.rectangle.stack"),
            KairosEngineStatus(title: "White-Label", state: "Branding", health: .healthy, systemImage: "wand.and.stars"),
            KairosEngineStatus(title: "Release Gate", state: "Validation", health: .attention, systemImage: "checkmark.seal")
        ]

        dailyRun = [
            KairosWorkflowStep(title: "Review Command State", detail: "Check active bottlenecks, system readiness, and current production queue.", systemImage: "rectangle.3.group"),
            KairosWorkflowStep(title: "Select Priority Work", detail: "Choose the next highest-value task from Shopify, products, knowledge, vault, or release work.", systemImage: "target"),
            KairosWorkflowStep(title: "Execute Production Pass", detail: "Generate or update the working asset, package, page, module, or operational record.", systemImage: "hammer"),
            KairosWorkflowStep(title: "Validate Output", detail: "Run quality, pricing, branding, vault, and publication checks before release.", systemImage: "checkmark.seal"),
            KairosWorkflowStep(title: "Queue Next Action", detail: "Record completion and move the system toward the next bottleneck.", systemImage: "arrow.forward.circle")
        ]

        automationQueue = [
            KairosRuntimeWorkItem(title: "Product Builds", category: .product, priority: .high, status: .queued, detail: "Digital products, books, KDP packages, modules, systems, and licenses.", systemImage: "shippingbox", progress: 0.0),
            KairosRuntimeWorkItem(title: "Shopify Prep", category: .shopify, priority: .high, status: .processing, detail: "Listings, collections, pages, metadata, navigation, and publication packages.", systemImage: "bag", progress: 0.42),
            KairosRuntimeWorkItem(title: "Knowledge Bank", category: .knowledge, priority: .high, status: .queued, detail: "Ingestion, classification, cross-linking, product candidates, and stale content.", systemImage: "brain", progress: 0.0),
            KairosRuntimeWorkItem(title: "System Vault", category: .vault, priority: .high, status: .queued, detail: "Customer entitlements, purchased assets, modules, systems, and license access.", systemImage: "lock.rectangle.stack", progress: 0.0),
            KairosRuntimeWorkItem(title: "Golden Master", category: .release, priority: .critical, status: .queued, detail: "Versioned deployment package, recovery manual, release manifest, and validation gate.", systemImage: "archivebox", progress: 0.0),
            KairosRuntimeWorkItem(title: "Backend Upgrade", category: .backend, priority: .medium, status: .deferred, detail: "Phase 2 scheduled jobs, hosted services, storage, API sync, and automation workers.", systemImage: "server.rack", progress: 0.0)
        ]

        approvalQueue = [
            KairosApprovalQueueItem(title: "Publish Shopify Product", detail: "Any product going live must be approved before customer visibility.", risk: .high, systemImage: "paperplane"),
            KairosApprovalQueueItem(title: "Issue Commercial License", detail: "Rights-bearing deliverables require license validation and white-label verification.", risk: .high, systemImage: "doc.text"),
            KairosApprovalQueueItem(title: "Launch Campaign", detail: "Marketing and advertising campaigns remain human-approved before external launch.", risk: .high, systemImage: "megaphone"),
            KairosApprovalQueueItem(title: "Archive Release", detail: "Golden Master and release records require version confirmation.", risk: .medium, systemImage: "archivebox")
        ]

        eventLog = [
            KairosWorkflowEvent(type: .runtimeInitialized, title: "Runtime initialized", detail: "Kairos loaded the shared operational runtime."),
            KairosWorkflowEvent(type: .workQueued, title: "Shopify batch queued", detail: "Commerce preparation, product packaging, and vault assignment are now active workstreams.")
        ]

        recalculateReadiness()
    }
}

struct KairosRuntimeState: Identifiable, Codable, Equatable {
    let id: UUID
    var operatingMode: OperatingMode
    var activeBatch: String
    var activeWorkflow: String
    var readiness: Double
    var currentVersion: String
    var goldenMasterStatus: String
    var updatedAt: Date

    static let seed = KairosRuntimeState(
        id: UUID(),
        operatingMode: .build,
        activeBatch: "Runtime Integration",
        activeWorkflow: "Shopify Operations Batch",
        readiness: 0.0,
        currentVersion: "0.3.0-build",
        goldenMasterStatus: "Pending",
        updatedAt: Date()
    )

    enum OperatingMode: String, Codable {
        case build = "Build"
        case operational = "Operational"
    }
}

struct KairosRuntimeWorkItem: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var category: Category
    var priority: Priority
    var status: Status
    var detail: String
    var systemImage: String
    var progress: Double
    var requiresApproval: Bool
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        category: Category,
        priority: Priority,
        status: Status,
        detail: String,
        systemImage: String,
        progress: Double,
        requiresApproval: Bool = false,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.category = category
        self.priority = priority
        self.status = status
        self.detail = detail
        self.systemImage = systemImage
        self.progress = progress
        self.requiresApproval = requiresApproval
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum Category: String, Codable {
        case dashboard = "Dashboard"
        case shopify = "Shopify"
        case orchestration = "Orchestration"
        case release = "Release"
        case product = "Product"
        case pricing = "Pricing"
        case vault = "Vault"
        case knowledge = "Knowledge"
        case backend = "Backend"
    }

    enum Priority: String, Codable {
        case critical = "Critical"
        case high = "High"
        case medium = "Medium"
        case low = "Low"
    }

    enum Status: String, Codable {
        case idle = "Idle"
        case queued = "Queued"
        case processing = "Processing"
        case waitingForApproval = "Waiting"
        case complete = "Complete"
        case failed = "Failed"
        case deferred = "Deferred"
    }
}

struct KairosEngineStatus: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var state: String
    var health: Health
    var systemImage: String
    var lastRun: Date?

    init(id: UUID = UUID(), title: String, state: String, health: Health, systemImage: String, lastRun: Date? = nil) {
        self.id = id
        self.title = title
        self.state = state
        self.health = health
        self.systemImage = systemImage
        self.lastRun = lastRun
    }

    enum Health: String, Codable {
        case healthy = "Healthy"
        case attention = "Attention"
        case blocked = "Blocked"
        case offline = "Offline"
    }
}

struct KairosWorkflowStep: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var detail: String
    var systemImage: String

    init(id: UUID = UUID(), title: String, detail: String, systemImage: String) {
        self.id = id
        self.title = title
        self.detail = detail
        self.systemImage = systemImage
    }
}

struct KairosOperatorAction: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var detail: String
    var systemImage: String

    init(id: UUID = UUID(), title: String, detail: String, systemImage: String) {
        self.id = id
        self.title = title
        self.detail = detail
        self.systemImage = systemImage
    }
}

struct KairosProductQueueItem: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var productType: String
    var detail: String
    var tags: [String]

    init(id: UUID = UUID(), title: String, productType: String, detail: String, tags: [String]) {
        self.id = id
        self.title = title
        self.productType = productType
        self.detail = detail
        self.tags = tags
    }
}

struct KairosApprovalQueueItem: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var detail: String
    var risk: Risk
    var systemImage: String

    init(id: UUID = UUID(), title: String, detail: String, risk: Risk, systemImage: String) {
        self.id = id
        self.title = title
        self.detail = detail
        self.risk = risk
        self.systemImage = systemImage
    }

    enum Risk: String, Codable {
        case high = "High"
        case medium = "Medium"
        case low = "Low"
    }
}

struct KairosWorkflowEvent: Identifiable, Codable, Equatable {
    let id: UUID
    var type: EventType
    var title: String
    var detail: String
    var createdAt: Date

    init(id: UUID = UUID(), type: EventType, title: String, detail: String, createdAt: Date = Date()) {
        self.id = id
        self.type = type
        self.title = title
        self.detail = detail
        self.createdAt = createdAt
    }

    enum EventType: String, Codable {
        case runtimeInitialized = "Runtime Initialized"
        case operationsStarted = "Operations Started"
        case workQueued = "Work Queued"
        case workCompleted = "Work Completed"
        case approvalRequested = "Approval Requested"
        case productCreated = "Product Created"
        case knowledgeIngested = "Knowledge Ingested"
        case shopifyPackagePrepared = "Shopify Package Prepared"
        case vaultAssignmentCompleted = "Vault Assignment Completed"
        case goldenMasterCreated = "Golden Master Created"
    }
}
