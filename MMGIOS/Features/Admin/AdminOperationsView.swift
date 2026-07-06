import SwiftUI

struct AdminOperationsView: View {
    let projectStore: LocalProjectStore

    private var adminProjects: [KairosProject] {
        projectStore.projects(in: .admin) + projectStore.projects(in: .publishing)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SectionHeader(
                        eyebrow: "Internal Workspace",
                        title: "Admin Operations",
                        bodyText: "Centralized control for MMG operating standards, task routing, customer workflow oversight, and system health."
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section("Operational Records") {
                    ForEach(adminProjects) { project in
                        NavigationLink {
                            ProjectDetailView(projectStore: projectStore, project: project)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(project.title)
                                    .font(.headline)
                                Text(project.status.rawValue)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("Current Doctrine") {
                    Label("Portal-first operating model", systemImage: "person.2.crop.square.stack")
                    Label("Clean canonical public URLs", systemImage: "link")
                    Label("Production-ready vertical slices", systemImage: "square.stack.3d.up")
                    Label("Human approval before external campaign launch", systemImage: "hand.raised")
                }
            }
            .navigationTitle("Admin")
        }
    }
}

#Preview {
    AdminOperationsView(projectStore: LocalProjectStore())
}
