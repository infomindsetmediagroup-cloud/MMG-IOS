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
                    metricRow(title: "High priority", value: highPriorityCount, systemImage: "exclamationmark.triangle")
                    metricRow(title: "Approval related", value: approvalRelatedCount, systemImage: "checkmark.seal")
                }

                Section("Next Actions") {
                    if actionItems.isEmpty {
                        ContentUnavailableView(
                            "No executive actions yet",
                            systemImage: "tray",
                            description: Text("Send a Kairos Chat command to route work into the operating queue.")
                        )
                    } else {
                        ForEach(actionItems) { item in
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

    private var queueHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Executive Action Queue")
                .font(.largeTitle.bold())
                .foregroundStyle(.mmgInk)

            Text("Review routed Kairos commands as actionable operating items before deeper workflow automation is attached.")
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
                Text(item.priority.label)
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(item.priority.tint.opacity(0.12))
                    .foregroundStyle(item.priority.tint)
                    .clipShape(Capsule())
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
                LabeledContent("Updated", value: item.updatedAt.formatted(date: .abbreviated, time: .shortened))
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
    let updatedAt: Date

    init(record: KnowledgeVaultRecord) {
        self.id = record.id
        self.department = ExecutiveActionItem.extractValue(prefix: "Department:", from: record.decisionHistory) ?? "Kairos"
        self.title = record.projectContext.isEmpty ? "Review routed Kairos command" : record.projectContext
        self.summary = ExecutiveActionItem.extractValue(prefix: "Summary:", from: record.decisionHistory) ?? record.decisionHistory
        self.source = record.decisionHistory
        self.priority = ExecutiveActionPriority.from(record: record)
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

#Preview {
    ExecutiveActionQueueView()
        .modelContainer(for: [
            KnowledgeVaultRecord.self
        ], inMemory: true)
}
