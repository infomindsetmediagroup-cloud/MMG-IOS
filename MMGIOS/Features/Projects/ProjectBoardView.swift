import SwiftData
import SwiftUI

struct ProjectBoardView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedProjectRecord.updatedAt, order: .reverse) private var projects: [PersistedProjectRecord]
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
                    ForEach(projects) { project in
                        NavigationLink {
                            ProjectDetailView(project: project)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(project.title)
                                    .font(.headline)
                                Text("\(project.areaRawValue) • \(project.statusRawValue) • \(project.priorityRawValue)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete(perform: deleteProjects)
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
                ProjectEditorView()
            }
            .task {
                seedProjectsIfNeeded()
            }
        }
    }

    private func seedProjectsIfNeeded() {
        guard projects.isEmpty else { return }

        for project in SampleData.projects {
            modelContext.insert(PersistedProjectRecord(project: project))
        }
    }

    private func deleteProjects(at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(projects[index])
        }
    }
}

#Preview {
    ProjectBoardView()
        .modelContainer(for: PersistedProjectRecord.self, inMemory: true)
}
