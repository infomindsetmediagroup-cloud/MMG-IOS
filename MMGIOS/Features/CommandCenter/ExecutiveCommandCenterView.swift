import SwiftData
import SwiftUI

struct ExecutiveCommandCenterView: View {
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]
    @Query(sort: \KnowledgeVaultRecord.updatedAt, order: .reverse) private var knowledgeRecords: [KnowledgeVaultRecord]

    private let columns = [GridItem(.adaptive(minimum: 158), spacing: 14)]

    private var activeCount: Int {
        tasks.filter { $0.status == ProductionTaskStatus.inProgress.rawValue }.count
    }

    private var queuedCount: Int {
        queueItems.filter {
            $0.status == ProductionQueueStatus.ready.rawValue ||
            $0.status == ProductionQueueStatus.retry.rawValue
        }.count
    }

    private var completedCount: Int {
        tasks.filter { $0.status == ProductionTaskStatus.completed.rawValue }.count
    }

    private var attentionCount: Int {
        tasks.filter { $0.status == ProductionTaskStatus.blocked.rawValue }.count
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    livingHeader
                    movementStrip

                    Text("Command Centers")
                        .font(.title2.bold())

                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(ExecutiveCommandCenter.allCases) { center in
                            NavigationLink {
                                destination(for: center)
                            } label: {
                                parentCard(center)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if attentionCount > 0 {
                        Label("\(attentionCount) item\(attentionCount == 1 ? "" : "s") needs your attention", systemImage: "exclamationmark.triangle.fill")
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(.orange)
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
                .padding(20)
            }
            .background(Color.mmgBackground)
            .navigationTitle("Kairos")
        }
    }

    private var livingHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(Color.mmgBlue.opacity(0.14)).frame(width: 48, height: 48)
                    Circle().fill(Color.mmgBlue).frame(width: 13, height: 13)
                        .shadow(color: .mmgBlue.opacity(0.65), radius: 8)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text("Kairos is operational")
                        .font(.title2.bold())
                    Text(activeCount > 0 ? "Working on \(activeCount) approved action\(activeCount == 1 ? "" : "s")." : "Ready for your next objective.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }

            if activeCount > 0 {
                ProgressView(value: Double(completedCount), total: Double(max(completedCount + activeCount, 1)))
                    .tint(.mmgBlue)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [.white, .mmgSurface], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.mmgBlue.opacity(0.16)))
    }

    private var movementStrip: some View {
        HStack(spacing: 10) {
            movementMetric("Queued", value: queuedCount, color: .secondary)
            movementMetric("Working", value: activeCount, color: .mmgBlue)
            movementMetric("Done", value: completedCount, color: .green)
        }
    }

    private func movementMetric(_ title: String, value: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(value)").font(.title2.bold()).foregroundStyle(color)
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func parentCard(_ center: ExecutiveCommandCenter) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: center.systemImage)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.mmgBlue)
            Text(center.title)
                .font(.headline)
                .foregroundStyle(.primary)
            Text(center.subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)
            Spacer(minLength: 0)
            HStack {
                Text(center.status(workflows: workflows, knowledgeCount: knowledgeRecords.count))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.mmgBlue)
                Spacer()
                Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 184, alignment: .topLeading)
        .background(.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.mmgBlue.opacity(0.10)))
    }

    @ViewBuilder
    private func destination(for center: ExecutiveCommandCenter) -> some View {
        switch center {
        case .executive:
            ExecutiveActionQueueView()
        case .shopify:
            ShopifyOperationsEngineView()
        case .production:
            ProductionCommandCenterView()
        case .knowledge:
            KnowledgeVaultReviewView()
        case .system:
            CommandCenterRuntimeSummaryView()
        }
    }
}

private enum ExecutiveCommandCenter: String, CaseIterable, Identifiable {
    case executive
    case shopify
    case production
    case knowledge
    case system

    var id: String { rawValue }

    var title: String {
        switch self {
        case .executive: return "Executive Operations"
        case .shopify: return "Shopify & Website"
        case .production: return "Products & Production"
        case .knowledge: return "Knowledge"
        case .system: return "System & Release"
        }
    }

    var subtitle: String {
        switch self {
        case .executive: return "Approve, execute, and monitor the work requiring your decision."
        case .shopify: return "Live storefront, homepage, products, and publishing operations."
        case .production: return "Customer work and MMG assets moving through production."
        case .knowledge: return "Completed work, decisions, and institutional memory."
        case .system: return "Release readiness, failures, and genuine operating health."
        }
    }

    var systemImage: String {
        switch self {
        case .executive: return "sparkles.rectangle.stack"
        case .shopify: return "bag"
        case .production: return "shippingbox"
        case .knowledge: return "books.vertical"
        case .system: return "checkmark.shield"
        }
    }

    func status(workflows: [WorkflowRecord], knowledgeCount: Int) -> String {
        switch self {
        case .knowledge:
            return "\(knowledgeCount) preserved"
        default:
            let active = workflows.filter { $0.status == RuntimeWorkflowStatus.active.rawValue }.count
            return active == 0 ? "Ready" : "\(active) working"
        }
    }
}
