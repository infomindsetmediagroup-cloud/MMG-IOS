import SwiftUI

struct KairosOperationalOrchestratorView: View {
    private let queues = KairosOperationalOrchestratorSeed.queues
    private let automationStages = KairosOperationalOrchestratorSeed.automationStages
    private let approvalItems = KairosOperationalOrchestratorSeed.approvalItems
    private let dailyRunItems = KairosOperationalOrchestratorSeed.dailyRunItems

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    hero
                    dailyOperations
                    automationQueue
                    approvalQueue
                    orchestrationFlow
                    operatorBoundary
                }
                .padding(20)
            }
            .background(KairosOrchestratorPalette.ink.ignoresSafeArea())
            .navigationTitle("Orchestrator")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(KairosOrchestratorPalette.blue.opacity(0.18))
                        .frame(width: 64, height: 64)

                    Image(systemName: "arrow.triangle.branch")
                        .font(.system(size: 31, weight: .semibold))
                        .foregroundStyle(KairosOrchestratorPalette.blue)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Operational Orchestrator")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)

                    Text("The end-to-end controller that turns Kairos from separate command centers into one executable business workflow.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.70))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack(spacing: 10) {
                OrchestratorPill(title: "Run State", value: "Manual", systemImage: "hand.tap")
                OrchestratorPill(title: "Autonomy", value: "Phase 1", systemImage: "sparkles")
            }
        }
        .padding(18)
        .background(KairosOrchestratorPalette.card, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 1)
        )
    }

    private var dailyOperations: some View {
        OrchestratorSection(title: "Daily Operations Run", subtitle: "The manual trigger sequence until backend scheduling is active.") {
            VStack(spacing: 12) {
                ForEach(Array(dailyRunItems.enumerated()), id: \.element.id) { index, item in
                    HStack(alignment: .top, spacing: 12) {
                        Text(String(format: "%02d", index + 1))
                            .font(.caption.weight(.bold))
                            .foregroundStyle(KairosOrchestratorPalette.blue)
                            .frame(width: 34, height: 34)
                            .background(KairosOrchestratorPalette.blue.opacity(0.14), in: Circle())

                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)

                            Text(item.detail)
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.62))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer()

                        Image(systemName: item.systemImage)
                            .foregroundStyle(KairosOrchestratorPalette.blue)
                    }
                    .padding(14)
                    .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
        }
    }

    private var automationQueue: some View {
        OrchestratorSection(title: "Automation Queue", subtitle: "Work Kairos can prepare now and later execute automatically through backend services.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
                ForEach(queues) { queue in
                    VStack(alignment: .leading, spacing: 10) {
                        Image(systemName: queue.systemImage)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(KairosOrchestratorPalette.blue)

                        Text(queue.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)

                        Text(queue.detail)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.62))
                            .fixedSize(horizontal: false, vertical: true)

                        Text(queue.status)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white.opacity(0.78))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(.white.opacity(0.075), in: Capsule())
                    }
                    .frame(maxWidth: .infinity, minHeight: 140, alignment: .topLeading)
                    .padding(16)
                    .background(.white.opacity(0.052), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
            }
        }
    }

    private var approvalQueue: some View {
        OrchestratorSection(title: "Approval Queue", subtitle: "Human approval remains required before external publication or customer-facing release.") {
            VStack(spacing: 12) {
                ForEach(approvalItems) { item in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: item.systemImage)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(KairosOrchestratorPalette.blue)
                            .frame(width: 34, height: 34)
                            .background(.white.opacity(0.06), in: Circle())

                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)

                            Text(item.detail)
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.62))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer()

                        Text(item.risk)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(item.risk == "High" ? .orange : KairosOrchestratorPalette.blue)
                    }
                    .padding(14)
                    .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
        }
    }

    private var orchestrationFlow: some View {
        OrchestratorSection(title: "Workflow Controller", subtitle: "The normalized route every operational request follows.") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(automationStages.enumerated()), id: \.element.id) { index, stage in
                    HStack(alignment: .top, spacing: 12) {
                        Text(String(format: "%02d", index + 1))
                            .font(.caption.weight(.bold))
                            .foregroundStyle(KairosOrchestratorPalette.blue)
                            .frame(width: 34, height: 34)
                            .background(KairosOrchestratorPalette.blue.opacity(0.14), in: Circle())

                        VStack(alignment: .leading, spacing: 4) {
                            Text(stage.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)

                            Text(stage.detail)
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.62))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    private var operatorBoundary: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Operator Boundary")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)

            Text("Kairos may prepare, classify, price, package, validate, and queue work during Phase 1. External publication, customer-facing release, live campaign launch, and commercial license issuance require explicit approval until backend governance is implemented.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .background(KairosOrchestratorPalette.blue.opacity(0.10), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(KairosOrchestratorPalette.blue.opacity(0.24), lineWidth: 1)
        )
    }
}

private struct OrchestratorSection<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.58))
            }
            content
        }
    }
}

private struct OrchestratorPill: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
            VStack(alignment: .leading, spacing: 1) {
                Text(title.uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white.opacity(0.52))
                Text(value)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(.white.opacity(0.07), in: Capsule())
    }
}

private enum KairosOrchestratorPalette {
    static let ink = Color(red: 0.04, green: 0.06, blue: 0.10)
    static let card = Color(red: 0.08, green: 0.10, blue: 0.15)
    static let blue = Color(red: 0.31, green: 0.85, blue: 1.0)
}

private enum KairosOperationalOrchestratorSeed {
    static let dailyRunItems = [
        OrchestratorDailyRunItem(title: "Review Command State", detail: "Check active bottlenecks, system readiness, and current production queue.", systemImage: "rectangle.3.group"),
        OrchestratorDailyRunItem(title: "Select Priority Work", detail: "Choose the next highest-value task from Shopify, products, knowledge, vault, or release work.", systemImage: "target"),
        OrchestratorDailyRunItem(title: "Execute Production Pass", detail: "Generate or update the working asset, package, page, module, or operational record.", systemImage: "hammer"),
        OrchestratorDailyRunItem(title: "Validate Output", detail: "Run quality, pricing, branding, vault, and publication checks before release.", systemImage: "checkmark.seal"),
        OrchestratorDailyRunItem(title: "Queue Next Action", detail: "Record completion and move the system toward the next bottleneck.", systemImage: "arrow.forward.circle")
    ]

    static let queues = [
        OrchestratorQueueCard(title: "Product Builds", detail: "Digital products, books, KDP packages, modules, systems, and licenses.", status: "Ready", systemImage: "shippingbox"),
        OrchestratorQueueCard(title: "Shopify Prep", detail: "Listings, collections, pages, metadata, navigation, and publication packages.", status: "Ready", systemImage: "bag"),
        OrchestratorQueueCard(title: "Knowledge Bank", detail: "Ingestion, classification, cross-linking, product candidates, and stale content.", status: "Ready", systemImage: "brain"),
        OrchestratorQueueCard(title: "System Vault", detail: "Customer entitlements, purchased assets, modules, systems, and license access.", status: "Ready", systemImage: "lock.rectangle.stack"),
        OrchestratorQueueCard(title: "Golden Master", detail: "Versioned deployment package, recovery manual, release manifest, and validation gate.", status: "Queued", systemImage: "archivebox"),
        OrchestratorQueueCard(title: "Backend Upgrade", detail: "Phase 2 scheduled jobs, hosted services, storage, API sync, and automation workers.", status: "Deferred", systemImage: "server.rack")
    ]

    static let approvalItems = [
        OrchestratorApprovalItem(title: "Publish Shopify Product", detail: "Any product going live must be approved before customer visibility.", risk: "High", systemImage: "paperplane"),
        OrchestratorApprovalItem(title: "Issue Commercial License", detail: "Rights-bearing deliverables require license validation and white-label verification.", risk: "High", systemImage: "doc.text"),
        OrchestratorApprovalItem(title: "Launch Campaign", detail: "Marketing and advertising campaigns remain human-approved before external launch.", risk: "High", systemImage: "megaphone"),
        OrchestratorApprovalItem(title: "Archive Release", detail: "Golden Master and release records require version confirmation.", risk: "Medium", systemImage: "archivebox")
    ]

    static let automationStages = [
        OrchestratorWorkflowStage(title: "Receive Trigger", detail: "User command, product request, backlog item, or future backend event enters the queue."),
        OrchestratorWorkflowStage(title: "Route Work", detail: "Kairos chooses the correct engine: Shopify, Product, Pricing, Knowledge, Vault, Licensing, or Release."),
        OrchestratorWorkflowStage(title: "Execute Engine", detail: "The selected subsystem manufactures or updates the required operational asset."),
        OrchestratorWorkflowStage(title: "Validate Gate", detail: "Quality checks confirm that the output is complete, correctly priced, branded, and publishable."),
        OrchestratorWorkflowStage(title: "Request Approval", detail: "External release waits for approval unless future governance explicitly authorizes automation."),
        OrchestratorWorkflowStage(title: "Record State", detail: "Kairos updates status, backlog, version history, and the next recommended action.")
    ]
}

private struct OrchestratorDailyRunItem: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let systemImage: String
}

private struct OrchestratorQueueCard: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let status: String
    let systemImage: String
}

private struct OrchestratorApprovalItem: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let risk: String
    let systemImage: String
}

private struct OrchestratorWorkflowStage: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
}

#Preview {
    KairosOperationalOrchestratorView()
}
