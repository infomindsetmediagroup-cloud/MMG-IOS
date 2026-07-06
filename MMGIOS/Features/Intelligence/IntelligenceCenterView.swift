import SwiftData
import SwiftUI

struct IntelligenceCenterView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedIntelligenceItemRecord.updatedAt, order: .reverse) private var items: [PersistedIntelligenceItemRecord]

    private var openItems: [PersistedIntelligenceItemRecord] {
        items.filter(\.isOpen)
    }

    private var approvalItems: [PersistedIntelligenceItemRecord] {
        items.filter { item in
            item.requiresApproval && item.status != .approved && item.status != .completed && item.status != .dismissed
        }
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                statusSection
                prioritySection
                allItemsSection
            }
            .navigationTitle("Intelligence")
            .task { seedItemsIfNeeded() }
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Automation Layer",
                title: "Intelligence Center",
                bodyText: "A controlled decision layer for workflow signals, routing recommendations, quality exceptions, and approval-first automation across Kairos."
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var statusSection: some View {
        Section("System Status") {
            LabeledContent("Open signals", value: "\(openItems.count)")
            LabeledContent("Needs approval", value: "\(approvalItems.count)")
            Label("Human approval remains required before external action", systemImage: "hand.raised")
        }
    }

    private var prioritySection: some View {
        Section("Priority Queue") {
            if approvalItems.isEmpty {
                Text("No intelligence items are waiting for approval.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(approvalItems) { item in
                    IntelligenceItemRow(item: item)
                }
            }
        }
    }

    private var allItemsSection: some View {
        Section("Intelligence Items") {
            if items.isEmpty {
                Text("No intelligence items have been detected yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(items) { item in
                    IntelligenceItemRow(item: item)
                }
            }
        }
    }

    private func seedItemsIfNeeded() {
        guard items.isEmpty else { return }
        for item in SampleData.intelligenceItems {
            modelContext.insert(PersistedIntelligenceItemRecord(item: item))
        }
    }
}

private struct IntelligenceItemRow: View {
    @Bindable var item: PersistedIntelligenceItemRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: iconName)
                    .foregroundStyle(statusColor)
                    .font(.title3)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(.headline)
                    Text("\(item.itemType.rawValue) • \(item.sourceName) • \(item.confidence.rawValue) confidence")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 8)
                statusMenu
            }

            Text(item.summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Text(item.recommendation)
                .font(.caption)
                .foregroundStyle(.secondary)

            if item.requiresApproval {
                Label("Approval required", systemImage: "lock.shield")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }

    private var statusMenu: some View {
        Menu {
            ForEach(IntelligenceItemStatus.allCases) { status in
                Button {
                    item.setStatus(status)
                } label: {
                    Label(status.rawValue, systemImage: status == item.status ? "checkmark" : status.iconName)
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.title3)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Change intelligence item status")
        }
    }

    private var iconName: String {
        item.status.iconName
    }

    private var statusColor: Color {
        switch item.status {
        case .detected:
            return .mmgBlue
        case .reviewing:
            return .orange
        case .approved:
            return .green
        case .completed:
            return .secondary
        case .dismissed:
            return .red
        }
    }
}

private extension IntelligenceItemStatus {
    var iconName: String {
        switch self {
        case .detected:
            return "sparkles"
        case .reviewing:
            return "magnifyingglass.circle"
        case .approved:
            return "checkmark.seal.fill"
        case .completed:
            return "checkmark.circle.fill"
        case .dismissed:
            return "xmark.circle.fill"
        }
    }
}

#Preview {
    IntelligenceCenterView()
        .modelContainer(try! PersistenceContainerFactory.makeContainer(inMemory: true))
}
