import SwiftData
import SwiftUI

struct QualityChecklistView: View {
    let project: PersistedProjectRecord
    @Bindable var checklist: PersistedReleaseChecklistRecord?

    var body: some View {
        List {
            headerSection
            if let checklist {
                ChecklistContentView(checklist: checklist)
            } else {
                noChecklistSection
            }
        }
        .navigationTitle("Checklist")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerSection: some View {
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
    }

    private var noChecklistSection: some View {
        Section("No Checklist") {
            Text("No release checklist is attached to this project yet.")
                .foregroundStyle(.secondary)
        }
    }
}

private struct ChecklistContentView: View {
    @Bindable var checklist: PersistedReleaseChecklistRecord

    var body: some View {
        gateStatusSection
        qualityGatesSection
    }

    private var gateStatusSection: some View {
        Section("Gate Status") {
            LabeledContent("Checklist", value: checklist.title)
            LabeledContent("Ready", value: checklist.isReleaseReady ? "Yes" : "No")
            LabeledContent("Release Notes", value: checklist.releaseNotes)
        }
    }

    private var qualityGatesSection: some View {
        Section("Quality Gates") {
            ForEach(checklist.decodedGates) { gate in
                QualityGateRow(gate: gate) {
                    checklist.toggleGate(gateID: gate.id)
                }
            }
        }
    }
}

private struct QualityGateRow: View {
    let gate: QualityGate
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(alignment: .top, spacing: 12) {
                gateIcon
                gateText
                Spacer()
            }
        }
        .buttonStyle(.plain)
    }

    private var gateIcon: some View {
        Image(systemName: gate.status == .passed ? "checkmark.circle.fill" : "circle")
            .foregroundStyle(gate.status == .passed ? .mmgBlue : .secondary)
    }

    private var gateText: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(gate.title)
                .font(.headline)
            Text(gate.detail)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(gate.status.rawValue)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    let project = PersistedProjectRecord(project: SampleData.projects[0])
    let checklist = PersistedReleaseChecklistRecord(checklist: SampleData.releaseChecklists(for: SampleData.projects)[0])
    return NavigationStack {
        QualityChecklistView(project: project, checklist: checklist)
    }
    .modelContainer(try! PersistenceContainerFactory.makeContainer(inMemory: true))
}
