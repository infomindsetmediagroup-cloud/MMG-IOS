import SwiftData
import SwiftUI

struct ProjectDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Bindable var project: PersistedProjectRecord

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text(project.areaRawValue.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.mmgBlue)
                        .tracking(1.2)

                    Text(project.title)
                        .font(.largeTitle.bold())

                    Text(project.summary)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Record") {
                LabeledContent("Client", value: project.clientName)
                Picker("Status", selection: $project.statusRawValue) {
                    ForEach(WorkflowStatus.allCases) { status in
                        Text(status.rawValue).tag(status.rawValue)
                    }
                }
                Picker("Priority", selection: $project.priorityRawValue) {
                    ForEach(WorkflowPriority.allCases) { priority in
                        Text(priority.rawValue).tag(priority.rawValue)
                    }
                }
            }

            Section("Workflow Area") {
                Picker("Area", selection: $project.areaRawValue) {
                    ForEach(WorkflowArea.allCases) { area in
                        Text(area.rawValue).tag(area.rawValue)
                    }
                }
            }

            Section("Project Text") {
                TextField("Title", text: $project.title)
                TextField("Summary", text: $project.summary, axis: .vertical)
                    .lineLimit(4, reservesSpace: true)
            }

            Section("Actions") {
                Button(role: .destructive) {
                    modelContext.delete(project)
                } label: {
                    Label("Delete Project", systemImage: "trash")
                }
            }
        }
        .navigationTitle("Project")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: project.title) { _, _ in project.updatedAt = Date() }
        .onChange(of: project.summary) { _, _ in project.updatedAt = Date() }
        .onChange(of: project.areaRawValue) { _, _ in project.updatedAt = Date() }
        .onChange(of: project.statusRawValue) { _, _ in project.updatedAt = Date() }
        .onChange(of: project.priorityRawValue) { _, _ in project.updatedAt = Date() }
    }
}

#Preview {
    let project = PersistedProjectRecord(project: SampleData.projects[0])
    return NavigationStack {
        ProjectDetailView(project: project)
    }
    .modelContainer(for: PersistedProjectRecord.self, inMemory: true)
}
