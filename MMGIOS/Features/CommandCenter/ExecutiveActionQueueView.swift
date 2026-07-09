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
                    let reviewItems = actionItems.filter { $0.status == .needsReview }
                    if reviewItems.isEmpty {
                        Text("No routed actions currently require review.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(reviewItems) { item in
                            actionNavigationLink(item)
                        }
                    }
                }

                Section("In Progress") {
                    let progressItems = actionItems.filter { $0.status == .inProgress }
                    if progressItems.isEmpty {
                        Text("No routed actions are in progress.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(progressItems) { item in
                            actionNavigationLink(item)
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
                            actionNavigationLink(item)
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
                            actionNavigationLink(item)
                        }
                    }
                }

                Section("Completed") {
                    let completedItems = actionItems.filter { $0.status == .completed }
                    if completedItems.isEmpty {
                        Text("No routed actions have been completed.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(completedItems) { item in
                            actionNavigationLink(item)
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

    private func appendState(_ status: ExecutiveActionStatus) {
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
    let status: ExecutiveActionStatus
    let updatedAt: Date

    init(record: KnowledgeVaultRecord) {
        self.record = record
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
    case inProgress
    case monitor
    case completed

    var label: String {
        switch self {
        case .needsReview:
            return "Needs Review"
        case .readyToExecute:
            return "Ready"
        case .inProgress:
            return "In Progress"
        case .monitor:
            return "Monitor"
        case .completed:
            return "Complete"
        }
    }

    var tint: Color {
        switch self {
        case .needsReview:
            return .orange
        case .readyToExecute, .inProgress:
            return .mmgBlue
        case .monitor:
            return .secondary
        case .completed:
            return .green
        }
    }

    var nextStep: String {
        switch self {
        case .needsReview:
            return "Review the routed action, confirm the governing decision, then approve or redirect before execution."
        case .readyToExecute:
            return "Convert the routed action into a production task, workflow update, release step, or implementation slice."
        case .inProgress:
            return "Continue execution and update the record again when the action is completed or moved to monitoring."
        case .monitor:
            return "Track this item for context. No immediate execution step is required unless conditions change."
        case .completed:
            return "No further execution is required. Keep the record for audit history and institutional memory."
        }
    }

    static func from(record: KnowledgeVaultRecord) -> ExecutiveActionStatus {
        if let persisted = latestPersistedStatus(from: record.decisionHistory) {
            return persisted
        }

        let searchable = "\(record.projectContext) \(record.decisionHistory)".lowercased()

        if searchable.contains("approval") || searchable.contains("blocked") || searchable.contains("gate") || searchable.contains("decision") {
            return .needsReview
        }

        if searchable.contains("execute") || searchable.contains("production") || searchable.contains("build") || searchable.contains("workflow") || searchable.contains("release") {
            return .readyToExecute
        }

        return .monitor
    }

    private static func latestPersistedStatus(from history: String) -> ExecutiveActionStatus? {
        history
            .components(separatedBy: .newlines)
            .reversed()
            .compactMap { line -> ExecutiveActionStatus? in
                guard line.hasPrefix("Action Status:") else { return nil }
                if line.contains("Complete") { return .completed }
                if line.contains("In Progress") { return .inProgress }
                if line.contains("Ready") { return .readyToExecute }
                if line.contains("Monitor") { return .monitor }
                if line.contains("Needs Review") { return .needsReview }
                return nil
            }
            .first
    }
}

#Preview {
    ExecutiveActionQueueView()
        .modelContainer(for: [
            KnowledgeVaultRecord.self
        ], inMemory: true)
}
