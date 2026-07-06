import SwiftUI

struct QualityReleaseView: View {
    let projectStore: LocalProjectStore
    let qualityStore: LocalQualityStore

    private var qualityProjects: [KairosProject] {
        projectStore.projects.filter { project in
            project.area == .quality || qualityStore.checklist(for: project.id) != nil
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SectionHeader(
                        eyebrow: "Validation Layer",
                        title: "Quality & Release",
                        bodyText: "QA gates, release-readiness checks, validation records, and approval tracking for Kairos-managed work."
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section("Release Records") {
                    ForEach(qualityProjects) { project in
                        NavigationLink {
                            QualityChecklistView(project: project, qualityStore: qualityStore)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(project.title)
                                    .font(.headline)
                                Text(releaseStatusText(for: project))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Quality")
        }
    }

    private func releaseStatusText(for project: KairosProject) -> String {
        guard let checklist = qualityStore.checklist(for: project.id) else { return "No checklist" }
        return checklist.isReleaseReady ? "Release ready" : "Validation pending"
    }
}

#Preview {
    QualityReleaseView(projectStore: LocalProjectStore(), qualityStore: LocalQualityStore())
}
