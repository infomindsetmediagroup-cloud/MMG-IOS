import SwiftData
import SwiftUI

struct QualityReleaseView: View {
    let projectStore: LocalProjectStore
    let qualityStore: LocalQualityStore

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedProjectRecord.updatedAt, order: .reverse) private var projects: [PersistedProjectRecord]
    @Query(sort: \PersistedReleaseChecklistRecord.updatedAt, order: .reverse) private var checklists: [PersistedReleaseChecklistRecord]

    private var qualityProjects: [PersistedProjectRecord] {
        projects.filter { project in
            project.areaRawValue == WorkflowArea.quality.rawValue || checklist(for: project.id) != nil
        }
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                releaseRecordsSection
            }
            .navigationTitle("Quality")
            .task { seedChecklistsIfNeeded() }
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Validation Layer",
                title: "Quality & Release",
                bodyText: "QA gates, release-readiness checks, validation records, and approval tracking for Kairos-managed work."
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var releaseRecordsSection: some View {
        Section("Release Records") {
            if qualityProjects.isEmpty {
                Text("No quality release records yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(qualityProjects) { project in
                    NavigationLink {
                        QualityChecklistView(project: project, checklist: checklist(for: project.id))
                    } label: {
                        QualityProjectRow(project: project, statusText: releaseStatusText(for: project))
                    }
                }
            }
        }
    }

    private func checklist(for projectID: UUID) -> PersistedReleaseChecklistRecord? {
        checklists.first { $0.projectID == projectID }
    }

    private func releaseStatusText(for project: PersistedProjectRecord) -> String {
        guard let checklist = checklist(for: project.id) else { return "No checklist" }
        return checklist.isReleaseReady ? "Release ready" : "Validation pending"
    }

    private func seedChecklistsIfNeeded() {
        guard checklists.isEmpty else { return }
        let domainProjects = projects.map { KairosProject(persistedRecord: $0) }
        let seededChecklists = SampleData.releaseChecklists(for: domainProjects)
        for checklist in seededChecklists {
            modelContext.insert(PersistedReleaseChecklistRecord(checklist: checklist))
        }
    }
}

private struct QualityProjectRow: View {
    let project: PersistedProjectRecord
    let statusText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(project.title)
                .font(.headline)
            Text(statusText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    QualityReleaseView(projectStore: LocalProjectStore(), qualityStore: LocalQualityStore())
        .modelContainer(try! PersistenceContainerFactory.makeContainer(inMemory: true))
}
