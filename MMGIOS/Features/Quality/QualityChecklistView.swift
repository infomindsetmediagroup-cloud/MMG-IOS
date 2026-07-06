import SwiftData
import SwiftUI

struct QualityChecklistView: View {
    let project: PersistedProjectRecord
    @State var checklist: PersistedReleaseChecklistRecord?

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
                InternalQualityGateRow(gate: gate) { status in
                    checklist.setGateStatus(gateID: gate.id, status: status)
                }
            }
        }
    }
}

private struct InternalQualityGateRow: View {
    let gate: QualityGate
    let setStatus: (QualityGateStatus) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            gateIcon
            gateText
            Spacer(minLength: 12)
            statusMenu
        }
        .padding(.vertical, 4)
    }

    private var gateIcon: some View {
        Image(systemName: iconName)
            .foregroundStyle(statusColor)
            .font(.title3)
            .accessibilityHidden(true)
    }

    private var gateText: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(gate.title)
                    .font(.headline)

                if gate.required {
                    Text("Required")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }

            Text(gate.detail)
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(gate.status.rawValue)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(statusColor)
        }
    }

    private var statusMenu: some View {
        Menu {
            ForEach(QualityGateStatus.allCases) { status in
                Button {
                    setStatus(status)
                } label: {
                    Label(status.rawValue, systemImage: status == gate.status ? "checkmark" : status.iconName)
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.title3)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Change gate status")
        }
    }

    private var iconName: String {
        gate.status.iconName
    }

    private var statusColor: Color {
        switch gate.status {
        case .pending:
            return .secondary
        case .passed:
            return .mmgBlue
        case .failed:
            return .red
        case .waived:
            return .orange
        }
    }
}

private extension QualityGateStatus {
    var iconName: String {
        switch self {
        case .pending:
            return "circle"
        case .passed:
            return "checkmark.circle.fill"
        case .failed:
            return "xmark.octagon.fill"
        case .waived:
            return "exclamationmark.triangle.fill"
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
