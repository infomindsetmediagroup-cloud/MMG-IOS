import SwiftData
import SwiftUI

struct ExecutiveActionQueueView: View {
    @Query(sort: \KnowledgeVaultRecord.updatedAt, order: .reverse) private var records: [KnowledgeVaultRecord]

    private var actionItems: [ExecutiveActionItem] {
        records.prefix(20).map { ExecutiveActionItem(record: $0) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    queueHeader
                }
                .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
                .listRowBackground(Color.clear)

                Section("Queue Metrics") {
                    metricRow(title: "Open actions", value: actionItems.count, systemImage: "tray.full")
                    metricRow(title: "Needs review", value: needsReviewCount, systemImage: "eye")
                    metricRow(title: "Ready to execute", value: readyToExecuteCount, systemImage: "play.circle")
                    metricRow(title: "High priority", value: highPriorityCount, systemImage: "exclamationmark.triangle")
                    metricRow(title: "Approval related", value: approvalRelatedCount, systemImage: "checkmark.seal")
                }

                Section("Needs Review") {
                    let reviewItems = actionItems.filter { $0.status == .needsReview }
                    if reviewItems.isEmpty {
                        Text("No routed actions currently require review.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(reviewItems) { item in
                            NavigationLink {
                                ExecutiveActionDetailView(item: item)
                            } label: {
                                actionRow(item)
                            }
                        }
                    }
                }

                Section("Ready to Execute") {
                    let readyItems = actionItems.filter { $0.status == .readyToExecute }
                    if readyItems.isEmpty {
                        Text("No routed actions are ready to execute yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(readyItems) { item in
                            NavigationLink {
                                ExecutiveActionDetailView(item: item)
                            } label: {
                                actionRow(item)
                            }
                        }
                    }
                }

                Section("Monitor") {
                    let monitorItems = actionItems.filter { $0.status == .monitor }
                    if monitorItems.isEmpty {
                        Text("No routed actions are in monitor status.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(monitorItems) { item in
                            NavigationLink {
                                ExecutiveActionDetailView(item: item)
                            } label: {
                                actionRow(item)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Actions")
            .scrollContentBackground(.hidden)
            .background(Color.mmgBackground)
        }
    }

    private var highPriorityCount: Int {
        actionItems.filter { $0.priority == .high }.count
    }

    private var approvalRelatedCount: Int {
        actionItems.filter { $0.department == "Executive Office" || $0.summary.lowercased().contains("approval") }.count
    }

    private var needsReviewCount: Int {
        actionItems.filter { $0.status == .needsReview }.count
    }

    private var readyToExecuteCount: Int {
        actionItems.filter { $0.status == .readyToExecute }.count
    }

    private var queueHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Executive Action Queue")
                .font(.largeTitle.bold())
                .foregroundStyle(.mmgInk)

            Text("Review routed Kairos commands as actionable operating items. Status is currently derived from routing context until persisted execution state is introduced.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [.white, .mmgSurface], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.mmgBlue.opacity(0.16), lineWidth: 1)
        )
    }

    private func metricRow(title: String, value: Int, systemImage: String) -> some View {
        Label {
            LabeledContent(title, value: "\(value)")
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(.mmgBlue)
        }
    }

    private func actionRow(_ item: ExecutiveActionItem) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.title)
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                VStack(alignment: .trailing, spacing: 5) {
                    Text(item.priority.label)
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(item.priority.tint.opacity(0.12))
                        .foregroundStyle(item.priority.tint)
                        .clipShape(Capsule())
                    Text(item.status.label)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(item.status.tint.opacity(0.12))
                        .foregroundStyle(item.status.tint)
                        .clipShape(Capsule())
                }
            }

            Text(item.department)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.mmgBlue)

            Text(item.summary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)

            Text(item.updatedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

private struct ExecutiveActionDetailView: View {
    let item: ExecutiveActionItem

    var body: some View {
        List {
            Section("Action") {
                LabeledContent("Department", value: item.department)
                LabeledContent("Priority", value: item.priority.label)
                LabeledContent("Status", value: item.status.label)
                LabeledContent("Updated", value: item.updatedAt.formatted(date: .abbreviated, time: .shortened))
            }

            Section("Next Step") {
                Text(item.status.nextStep)
                    .textSelection(.enabled)
            }

            Section("Summary") {
                Text(item.summary)
                    .textSelection(.enabled)
            }

            Section("Source Record") {
                Text(item.source)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
            }
        }
        .navigationTitle("Action Detail")
    }
}

private struct ExecutiveActionItem: Identifiable {
    let id: String
    let title: String
    let department: String
    let summary: String
    let source: String
    let priority: ExecutiveActionPriority
    let status: ExecutiveActionStatus
    let updatedAt: Date

    init(record: KnowledgeVaultRecord) {
        self.id = record.id
        self.department = ExecutiveActionItem.extractValue(prefix: "Department:", from: record.decisionHistory) ?? "Kairos"
        self.title = record.projectContext.isEmpty ? "Review routed Kairos command" : record.projectContext
        self.summary = ExecutiveActionItem.extractValue(prefix: "Summary:", from: record.decisionHistory) ?? record.decisionHistory
        self.source = record.decisionHistory
        self.priority = ExecutiveActionPriority.from(record: record)
        self.status = ExecutiveActionStatus.from(record: record)
        self.updatedAt = record.updatedAt
    }

    private static func extractValue(prefix: String, from text: String) -> String? {
        text
            .components(separatedBy: .newlines)
            .first { $0.hasPrefix(prefix) }?
            .replacingOccurrences(of: prefix, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private enum ExecutiveActionPriority: Equatable {
    case high
    case normal

    var label: String {
        switch self {
        case .high:
            return "High"
        case .normal:
            return "Normal"
        }
    }

    var tint: Color {
        switch self {
        case .high:
            return .orange
        case .normal:
            return .mmgBlue
        }
    }

    static func from(record: KnowledgeVaultRecord) -> ExecutiveActionPriority {
        let searchable = "\(record.projectContext) \(record.decisionHistory)".lowercased()
        if searchable.contains("approval") || searchable.contains("blocked") || searchable.contains("gate") {
            return .high
        }
        return .normal
    }
}

private enum ExecutiveActionStatus: Equatable {
    case needsReview
    case readyToExecute
    case monitor

    var label: String {
        switch self {
        case .needsReview:
            return "Needs Review"
        case .readyToExecute:
            return "Ready"
        case .monitor:
            return "Monitor"
        }
    }

    var tint: Color {
        switch self {
        case .needsReview:
            return .orange
        case .readyToExecute:
            return .mmgBlue
        case .monitor:
            return .secondary
        }
    }

    var nextStep: String {
        switch self {
        case .needsReview:
            return "Review the routed action, confirm the governing decision, then approve or redirect before execution."
        case .readyToExecute:
            return "Convert the routed action into a production task, workflow update, release step, or implementation slice."
        case .monitor:
            return "Track this item for context. No immediate execution step is required unless conditions change."
        }
    }

    static func from(record: KnowledgeVaultRecord) -> ExecutiveActionStatus {
        let searchable = "\(record.projectContext) \(record.decisionHistory)".lowercased()

        if searchable.contains("approval") || searchable.contains("blocked") || searchable.contains("gate") || searchable.contains("decision") {
            return .needsReview
        }

        if searchable.contains("execute") || searchable.contains("production") || searchable.contains("build") || searchable.contains("workflow") || searchable.contains("release") {
            return .readyToExecute
        }

        return .monitor
    }
}

#Preview {
    ExecutiveActionQueueView()
        .modelContainer(for: [
            KnowledgeVaultRecord.self
        ], inMemory: true)
}
