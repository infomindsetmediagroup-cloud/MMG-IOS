import SwiftData
import SwiftUI

struct GrowthMarketingView: View {
    let projectStore: LocalProjectStore
    @Query(sort: \PersistedProjectRecord.updatedAt, order: .reverse) private var projects: [PersistedProjectRecord]

    private var growthProjects: [PersistedProjectRecord] {
        projects.filter { record in
            record.areaRawValue == WorkflowArea.growth.rawValue
        }
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                growthRecordsSection
                Section("Campaign Capabilities") {
                    CapabilityRow(title: "Campaign calendar")
                    CapabilityRow(title: "Promotion registry")
                    CapabilityRow(title: "Audience segmentation")
                    CapabilityRow(title: "Email orchestration")
                    CapabilityRow(title: "Landing page recommendations")
                    CapabilityRow(title: "Cross-sell and upsell planning")
                }
            }
            .navigationTitle("Growth")
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Approval-Controlled Growth",
                title: "Growth & Marketing",
                bodyText: "Campaign planning, promotional operations, audience lifecycle work, and advertising recommendations with human approval before external launch."
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var growthRecordsSection: some View {
        Section("Growth Records") {
            if growthProjects.isEmpty {
                Text("No growth records yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(growthProjects) { project in
                    NavigationLink {
                        ProjectDetailView(project: project)
                    } label: {
                        GrowthProjectRow(project: project)
                    }
                }
            }
        }
    }
}

private struct GrowthProjectRow: View {
    let project: PersistedProjectRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(project.title)
                .font(.headline)
            Text(project.summary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
    }
}

private struct CapabilityRow: View {
    let title: String

    var body: some View {
        Label(title, systemImage: "megaphone")
    }
}

#Preview {
    GrowthMarketingView(projectStore: LocalProjectStore())
        .modelContainer(for: PersistedProjectRecord.self, inMemory: true)
}
