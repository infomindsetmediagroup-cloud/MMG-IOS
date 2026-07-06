import SwiftUI

struct QualityChecklistView: View {
    let project: KairosProject
    let qualityStore: LocalQualityStore

    private var checklist: ReleaseChecklist? {
        qualityStore.checklist(for: project.id)
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text("RELEASE VALIDATION")
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

            if let checklist {
                Section("Gate Status") {
                    LabeledContent("Checklist", value: checklist.title)
                    LabeledContent("Ready", value: checklist.isReleaseReady ? "Yes" : "No")
                    LabeledContent("Release Notes", value: checklist.releaseNotes)
                }

                Section("Quality Gates") {
                    ForEach(checklist.gates) { gate in
                        QualityGateRow(gate: gate) {
                            qualityStore.toggleGate(checklistID: checklist.id, gateID: gate.id)
                        }
                    }
                }
            } else {
                Section("No Checklist") {
                    Text("No release checklist is attached to this project yet.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Checklist")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        QualityChecklistView(project: SampleData.projects[0], qualityStore: LocalQualityStore())
    }
}
