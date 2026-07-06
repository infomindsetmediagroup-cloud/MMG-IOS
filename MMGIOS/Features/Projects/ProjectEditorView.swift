import SwiftData
import SwiftUI

struct ProjectEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @State private var title = ""
    @State private var clientName = "MMG Internal"
    @State private var area: WorkflowArea = .production
    @State private var status: WorkflowStatus = .intake
    @State private var priority: WorkflowPriority = .standard
    @State private var summary = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Project") {
                    TextField("Title", text: $title)
                    TextField("Client", text: $clientName)
                    TextField("Summary", text: $summary, axis: .vertical)
                        .lineLimit(3, reservesSpace: true)
                }

                Section("Workflow") {
                    Picker("Area", selection: $area) {
                        ForEach(WorkflowArea.allCases) { area in
                            Text(area.rawValue).tag(area)
                        }
                    }

                    Picker("Status", selection: $status) {
                        ForEach(WorkflowStatus.allCases) { status in
                            Text(status.rawValue).tag(status)
                        }
                    }

                    Picker("Priority", selection: $priority) {
                        ForEach(WorkflowPriority.allCases) { priority in
                            Text(priority.rawValue).tag(priority)
                        }
                    }
                }
            }
            .navigationTitle("New Project")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveProject() }
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func saveProject() {
        let project = KairosProject(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            clientName: clientName.trimmingCharacters(in: .whitespacesAndNewlines),
            area: area,
            status: status,
            priority: priority,
            summary: summary.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        modelContext.insert(PersistedProjectRecord(project: project))
        dismiss()
    }
}

#Preview {
    ProjectEditorView()
        .modelContainer(for: PersistedProjectRecord.self, inMemory: true)
}
