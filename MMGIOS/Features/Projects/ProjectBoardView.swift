import SwiftUI

struct ProjectBoardView: View {
    let projectStore: LocalProjectStore
    @State private var showingEditor = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SectionHeader(
                        eyebrow: "Records",
                        title: "Project Board",
                        bodyText: "Create and review Kairos workflow records across the MMG operating system."
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section("All Projects") {
                    ForEach(projectStore.projects) { project in
                        NavigationLink {
                            ProjectDetailView(projectStore: projectStore, project: project)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(project.title)
                                    .font(.headline)
                                Text("\(project.area.rawValue) • \(project.status.rawValue) • \(project.priority.rawValue)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Projects")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingEditor = true
                    } label: {
                        Label("New", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingEditor) {
                ProjectEditorView(projectStore: projectStore)
            }
        }
    }
}

#Preview {
    ProjectBoardView(projectStore: LocalProjectStore())
}
