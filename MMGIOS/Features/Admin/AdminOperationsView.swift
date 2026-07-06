import SwiftData
import SwiftUI

struct AdminOperationsView: View {
    let projectStore: LocalProjectStore
    @Query(sort: \PersistedProjectRecord.updatedAt, order: .reverse) private var projects: [PersistedProjectRecord]

    private var adminProjects: [PersistedProjectRecord] {
        projects.filter { record in
            record.areaRawValue == WorkflowArea.admin.rawValue ||
            record.areaRawValue == WorkflowArea.publishing.rawValue
        }
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                operationalRecordsSection
                doctrineSection
            }
            .navigationTitle("Admin")
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Internal Workspace",
                title: "Admin Operations",
                bodyText: "Centralized control for MMG operating standards, task routing, customer workflow oversight, and system health."
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var operationalRecordsSection: some View {
        Section("Operational Records") {
            if adminProjects.isEmpty {
                Text("No admin records yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(adminProjects) { project in
                    NavigationLink {
                        ProjectDetailView(project: project)
                    } label: {
                        AdminProjectRow(project: project)
                    }
                }
            }
        }
    }

    private var doctrineSection: some View {
        Section("Current Doctrine") {
            DoctrineRow(title: "Portal-first operating model", systemImage: "person.2.crop.square.stack")
            DoctrineRow(title: "Clean canonical public URLs", systemImage: "link")
            DoctrineRow(title: "Production-ready vertical slices", systemImage: "square.stack.3d.up")
            DoctrineRow(title: "Human approval before external campaign launch", systemImage: "hand.raised")
        }
    }
}

private struct AdminProjectRow: View {
    let project: PersistedProjectRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(project.title)
                .font(.headline)
            Text(project.statusRawValue)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct DoctrineRow: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
    }
}

#Preview {
    AdminOperationsView(projectStore: LocalProjectStore())
        .modelContainer(for: PersistedProjectRecord.self, inMemory: true)
}
