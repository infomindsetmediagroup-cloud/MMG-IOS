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
                    metricRow(title: "Open actions", value: openActionCount, systemImage: "tray.full")
                    metricRow(title: "Needs review", value: needsReviewCount, systemImage: "eye")
                    metricRow(title: "In progress", value: inProgressCount, systemImage: "play.circle")
                    metricRow(title: "Completed", value: completedCount, systemImage: "checkmark.circle")
                    metricRow(title: "High priority", value: highPriorityCount, systemImage: "exclamationmark.triangle")
                }

                Section("Needs Review") {
                    actionSectionItems(actionItems.filter { $0.status == .needsReview }, emptyText: "No routed actions currently require review.")
                }

                Section("In Progress") {
                    actionSectionItems(actionItems.filter { $0.status == .inProgress }, emptyText: "No routed actions are in progress.")
                }

                Section("Ready to Execute") {
                    actionSectionItems(actionItems.filter { $0.status == .readyToExecute }, emptyText: "No routed actions are ready to execute yet.")
                }

                Section("Monitor") {
                    actionSectionItems(actionItems.filter { $0.status == .monitor }, emptyText: "No routed actions are in monitor status.")
                }

                Section("Completed") {
                    actionSectionItems(actionItems.filter { $0.status == .completed }, emptyText: "No routed actions have been completed.")
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

    private var openActionCount: Int {
        actionItems.filter { $0.status != .completed }.count
    }

    private var needsReviewCount: Int {
        actionItems.filter { $0.status == .needsReview }.count
    }

    private var inProgressCount: Int {
        actionItems.filter { $0.status == .inProgress }.count
    }

    private var completedCount: Int {
        actionItems.filter { $0.status == .completed }.count
    }

    private var queueHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Executive Action Queue")
                .font(.largeTitle.bold())
                .foregroundStyle(.mmgInk)

            Text("Review routed Kairos commands as actionable operating items. Status controls append traceable state notes to the Knowledge Vault record.")
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

    @ViewBuilder
    private func actionSectionItems(_ items: [ExecutiveActionItem], emptyText: String) -> some View {
        if items.isEmpty {
            Text(emptyText)
                .foregroundStyle(.secondary)
        } else {
            ForEach(items) { item in
                actionNavigationLink(item)
            }
        }
    }

    private func actionNavigationLink(_ item: ExecutiveActionItem) -> some View {
        NavigationLink {
            ExecutiveActionDetailView(record: item.record)
        } label: {
            actionRow(item)
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
    @Environment(\.modelContext) private var modelContext
    @Bindable var record: KnowledgeVaultRecord

    private var item: ExecutiveActionItem {
        ExecutiveActionItem(record: record)
    }

    var body: some View {
        List {
            Section("Action") {
                LabeledContent("Department", value: item.department)
                LabeledContent("Priority", value: item.priority.label)
                LabeledContent("Status", value: item.status.label)
                LabeledContent("Updated", value: item.updatedAt.formatted(date: .abbreviated, time: .shortened))
            }

            Section("Controls") {
                Button("Approve for Execution") {
                    appendState(.readyToExecute)
                }
                .disabled(item.status == .completed)

                Button("Start Execution") {
                    appendState(.inProgress)
                }
                .disabled(item.status == .completed)

                Button("Move to Monitor") {
                    appendState(.monitor)
                }
                .disabled(item.status == .completed)

                Button("Mark Complete") {
                    appendState(.completed)
                }
                .disabled(item.status == .completed)
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

    private func appendState(_ status: ExecutiveActionState) {
        let timestamp = Date().formatted(date: .abbreviated, time: .shortened)
        let note = "Action Status: \(status.label) @ \(timestamp)"

        if record.decisionHistory.isEmpty {
            record.decisionHistory = note
        } else {
            record.decisionHistory += "\n\n\(note)"
        }

        record.updatedAt = .now
        try? modelContext.save()
    }
}

private struct ExecutiveActionItem: Identifiable {
    let record: KnowledgeVaultRecord
    let id: String
    let title: String
    let department: String
    let summary: String
    let source: String
    let priority: ExecutiveActionPriority
    let status: ExecutiveActionState
    let updatedAt: Date

    init(record: KnowledgeVaultRecord) {
        self.record = record
        self.id = record.id
        self.department = ExecutiveActionItem.extractValue(prefix: "Department:", from: record.decisionHistory) ?? "Kairos"
        self.title = record.projectContext.isEmpty ? "Review routed Kairos command" : record.projectContext
        self.summary = ExecutiveActionItem.extractValue(prefix: "Summary:", from: record.decisionHistory) ?? record.decisionHistory
        self.source = record.decisionHistory
        self.priority = ExecutiveActionPriority.from(record: record)
        self.status = ExecutiveActionState.from(record: record)
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

#Preview {
    ExecutiveActionQueueView()
        .modelContainer(for: [
            KnowledgeVaultRecord.self
        ], inMemory: true)
}
