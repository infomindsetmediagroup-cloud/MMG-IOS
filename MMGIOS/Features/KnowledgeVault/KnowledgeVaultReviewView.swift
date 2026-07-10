import SwiftData
import SwiftUI

struct KnowledgeVaultReviewView: View {
    @Query(sort: \KnowledgeVaultRecord.updatedAt, order: .reverse) private var records: [KnowledgeVaultRecord]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    vaultHeader
                }
                .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
                .listRowBackground(Color.clear)

                Section("Vault Metrics") {
                    metricRow(title: "Total records", value: records.count, systemImage: "books.vertical")
                    metricRow(title: "Executive captures", value: executiveCaptureCount, systemImage: "message.badge")
                    metricRow(title: "Routed decisions", value: routedDecisionCount, systemImage: "arrow.triangle.branch")
                }

                Section("Recent Records") {
                    if records.isEmpty {
                        ContentUnavailableView(
                            "No knowledge records yet",
                            systemImage: "books.vertical",
                            description: Text("Send a Kairos Chat command to create the first institutional record.")
                        )
                    } else {
                        ForEach(records.prefix(12)) { record in
                            NavigationLink {
                                KnowledgeVaultRecordDetailView(record: record)
                            } label: {
                                recordRow(record)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Knowledge")
            .scrollContentBackground(.hidden)
            .background(Color.mmgBackground)
        }
    }

    private var executiveCaptureCount: Int {
        records.filter { $0.customerName == "MMG Executive" }.count
    }

    private var routedDecisionCount: Int {
        records.filter { $0.projectContext.lowercased().contains("routed") }.count
    }

    private var vaultHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Knowledge Vault")
                .font(.largeTitle.bold())
                .foregroundStyle(.mmgInk)

            Text("Review institutional records created by Kairos routing, executive commands, customer context, and future operating workflows.")
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

    private func recordRow(_ record: KnowledgeVaultRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(record.projectContext.isEmpty ? "Knowledge Record" : record.projectContext)
                .font(.headline)
                .lineLimit(2)

            Text(record.customerName)
                .font(.caption)
                .foregroundStyle(.secondary)

            if !record.decisionHistory.isEmpty {
                Text(record.decisionHistory)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            Text(record.updatedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

private struct KnowledgeVaultRecordDetailView: View {
    let record: KnowledgeVaultRecord

    var body: some View {
        List {
            Section("Context") {
                LabeledContent("Customer", value: record.customerName)
                LabeledContent("Project", value: record.projectContext)
                LabeledContent("Created", value: record.createdAt.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Updated", value: record.updatedAt.formatted(date: .abbreviated, time: .shortened))
            }

            if !record.brandProfile.isEmpty {
                Section("Brand Profile") {
                    Text(record.brandProfile)
                        .textSelection(.enabled)
                }
            }

            if !record.decisionHistory.isEmpty {
                Section("Decision History") {
                    Text(record.decisionHistory)
                        .font(.callout.monospaced())
                        .textSelection(.enabled)
                }
            }
        }
        .navigationTitle("Vault Record")
    }
}

#Preview {
    KnowledgeVaultReviewView()
        .modelContainer(for: [
            KnowledgeVaultRecord.self
        ], inMemory: true)
}
