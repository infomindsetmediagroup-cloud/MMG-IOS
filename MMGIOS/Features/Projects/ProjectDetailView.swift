import SwiftUI

struct ProjectDetailView: View {
    let projectStore: LocalProjectStore
    let project: KairosProject

    private var currentProject: KairosProject {
        projectStore.projects.first(where: { $0.id == project.id }) ?? project
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text(currentProject.area.rawValue.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.mmgBlue)
                        .tracking(1.2)

                    Text(currentProject.title)
                        .font(.largeTitle.bold())

                    Text(currentProject.summary)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Record") {
                LabeledContent("Client", value: currentProject.clientName)
                LabeledContent("Status", value: currentProject.status.rawValue)
                LabeledContent("Priority", value: currentProject.priority.rawValue)
            }

            Section("Tasks") {
                ForEach(currentProject.tasks) { task in
                    Button {
                        projectStore.toggleTask(projectID: currentProject.id, taskID: task.id)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: task.isComplete ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(task.isComplete ? .green : .secondary)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(task.title)
                                    .foregroundStyle(.primary)

                                if !task.notes.isEmpty {
                                    Text(task.notes)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Project")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        ProjectDetailView(projectStore: LocalProjectStore(), project: SampleData.projects[0])
    }
}
