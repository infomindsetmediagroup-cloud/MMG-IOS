import SwiftUI

struct KairosOperationsDashboardView: View {
    private let priorityItems = KairosOperationsDashboardSeed.priorityItems
    private let systemCards = KairosOperationsDashboardSeed.systemCards
    private let workflowStages = KairosOperationsDashboardSeed.workflowStages
    private let quickActions = KairosOperationsDashboardSeed.quickActions

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    heroSection
                    priorityExecutionSection
                    systemStatusSection
                    workflowSection
                    quickActionsSection
                    doctrineSection
                }
                .padding(20)
            }
            .background(KairosOperationsPalette.ink.ignoresSafeArea())
            .navigationTitle("Operations")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(KairosOperationsPalette.blue.opacity(0.18))
                        .frame(width: 64, height: 64)

                    Image(systemName: "command.circle.fill")
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(KairosOperationsPalette.blue)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Kairos Operations Dashboard")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)

                    Text("Build Mode control surface for the MMG ecosystem.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.72))
                }

                Spacer()
            }

            HStack(spacing: 10) {
                KairosStatusBadge(title: "Mode", value: "Build", systemImage: "hammer")
                KairosStatusBadge(title: "Gate", value: "Pre-Live", systemImage: "lock.shield")
            }
        }
        .padding(18)
        .background(KairosOperationsPalette.card, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 1)
        )
    }

    private var priorityExecutionSection: some View {
        KairosOperationsSection(title: "Critical Path", subtitle: "The execution order required before Operational Mode.") {
            VStack(spacing: 12) {
                ForEach(priorityItems) { item in
                    HStack(spacing: 12) {
                        Image(systemName: item.systemImage)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(item.isActive ? KairosOperationsPalette.blue : .white.opacity(0.54))
                            .frame(width: 32, height: 32)
                            .background(.white.opacity(0.06), in: Circle())

                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)

                            Text(item.detail)
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.62))
                        }

                        Spacer()

                        Text(item.status)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(item.isActive ? KairosOperationsPalette.blue : .white.opacity(0.58))
                    }
                    .padding(14)
                    .background(.white.opacity(item.isActive ? 0.075 : 0.045), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
        }
    }

    private var systemStatusSection: some View {
        KairosOperationsSection(title: "Subsystem Status", subtitle: "Current enterprise foundation defined in the MMG IOS.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                ForEach(systemCards) { card in
                    VStack(alignment: .leading, spacing: 12) {
                        Image(systemName: card.systemImage)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(KairosOperationsPalette.blue)

                        Text(card.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)

                        Text(card.state)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.66))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(.white.opacity(0.052), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
            }
        }
    }

    private var workflowSection: some View {
        KairosOperationsSection(title: "Operational Orchestration", subtitle: "How Kairos moves work from idea to publication.") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(workflowStages.enumerated()), id: \.element.id) { index, stage in
                    HStack(alignment: .top, spacing: 12) {
                        Text(String(format: "%02d", index + 1))
                            .font(.caption.weight(.bold))
                            .foregroundStyle(KairosOperationsPalette.blue)
                            .frame(width: 34, height: 34)
                            .background(KairosOperationsPalette.blue.opacity(0.14), in: Circle())

                        VStack(alignment: .leading, spacing: 4) {
                            Text(stage.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)

                            Text(stage.detail)
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.62))
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private var quickActionsSection: some View {
        KairosOperationsSection(title: "Operator Actions", subtitle: "Manual triggers available before backend automation.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                ForEach(quickActions) { action in
                    VStack(alignment: .leading, spacing: 10) {
                        Image(systemName: action.systemImage)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(KairosOperationsPalette.blue)

                        Text(action.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)

                        Text(action.detail)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
                    .padding(16)
                    .background(.white.opacity(0.052), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
            }
        }
    }

    private var doctrineSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Progressive Autonomy")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)

            Text("Kairos launches as an AI-guided operating system first, then expands into hybrid backend automation and ultimately enterprise autonomy without redesigning the core architecture.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .background(KairosOperationsPalette.blue.opacity(0.10), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(KairosOperationsPalette.blue.opacity(0.24), lineWidth: 1)
        )
    }
}

private struct KairosOperationsSection<Content: View>: View {
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

private struct KairosStatusBadge: View {
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
        .foregroundStyle(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(.white.opacity(0.07), in: Capsule())
    }
}

private enum KairosOperationsPalette {
    static let ink = Color(red: 0.04, green: 0.06, blue: 0.10)
    static let card = Color(red: 0.08, green: 0.10, blue: 0.15)
    static let blue = Color(red: 0.31, green: 0.85, blue: 1.0)
}

private enum KairosOperationsDashboardSeed {
    static let priorityItems = [
        KairosPriorityItem(title: "Operations Dashboard", detail: "Unified Build Mode command surface.", status: "Active", systemImage: "rectangle.3.group", isActive: true),
        KairosPriorityItem(title: "Shopify Operations Engine", detail: "Products, pages, collections, and publishing flow.", status: "Next", systemImage: "cart.badge.plus", isActive: false),
        KairosPriorityItem(title: "Operational Orchestrator", detail: "End-to-end workflow controller.", status: "Queued", systemImage: "arrow.triangle.branch", isActive: false),
        KairosPriorityItem(title: "Golden Master Generator", detail: "Backup, release archive, and recovery package.", status: "Queued", systemImage: "archivebox", isActive: false)
    ]

    static let systemCards = [
        KairosSystemCard(title: "Knowledge Bank", state: "Defined", systemImage: "brain"),
        KairosSystemCard(title: "Product Engine", state: "Defined", systemImage: "shippingbox"),
        KairosSystemCard(title: "Pricing Engine", state: "Defined", systemImage: "dollarsign.circle"),
        KairosSystemCard(title: "System Vault", state: "Defined", systemImage: "lock.rectangle.stack"),
        KairosSystemCard(title: "White-Label", state: "Defined", systemImage: "wand.and.stars"),
        KairosSystemCard(title: "Licensing", state: "Defined", systemImage: "doc.text"),
        KairosSystemCard(title: "Deployment", state: "Defined", systemImage: "server.rack"),
        KairosSystemCard(title: "Autonomy", state: "Phase 1", systemImage: "sparkles")
    ]

    static let workflowStages = [
        KairosWorkflowStage(title: "Capture", detail: "Receive idea, asset, research item, service, or product concept."),
        KairosWorkflowStage(title: "Classify", detail: "Assign knowledge category, product class, license eligibility, and vault destination."),
        KairosWorkflowStage(title: "Manufacture", detail: "Generate product assets, guide, pricing record, metadata, and workflow package."),
        KairosWorkflowStage(title: "Validate", detail: "Check quality, pricing, branding, white-label status, Shopify readiness, and licensing."),
        KairosWorkflowStage(title: "Publish", detail: "Prepare Shopify listing, Knowledge Library entry, System Vault entitlement, and release record.")
    ]

    static let quickActions = [
        KairosQuickAction(title: "Start Daily Ops", detail: "Invoke current operating queue.", systemImage: "play.circle"),
        KairosQuickAction(title: "Build Product", detail: "Run manufacturing pipeline.", systemImage: "plus.square.on.square"),
        KairosQuickAction(title: "Price Asset", detail: "Apply canonical pricing ladder.", systemImage: "tag"),
        KairosQuickAction(title: "Prepare Shopify", detail: "Generate listing materials.", systemImage: "bag"),
        KairosQuickAction(title: "Vault Package", detail: "Create customer access bundle.", systemImage: "lock.doc"),
        KairosQuickAction(title: "Release Check", detail: "Validate before publication.", systemImage: "checkmark.seal")
    ]
}

private struct KairosPriorityItem: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let status: String
    let systemImage: String
    let isActive: Bool
}

private struct KairosSystemCard: Identifiable {
    let id = UUID()
    let title: String
    let state: String
    let systemImage: String
}

private struct KairosWorkflowStage: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
}

private struct KairosQuickAction: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let systemImage: String
}

#Preview {
    KairosOperationsDashboardView()
}
