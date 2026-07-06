import SwiftUI

public struct PublishingApprovalView: View {
    @State private var workflow: PublishingApprovalWorkflow

    public init(projectID: UUID = PublishingProject.sample.id) {
        _workflow = State(initialValue: PublishingApprovalFactory.makeDefaultWorkflow(projectID: projectID))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                checkpointList
            }
            .padding(20)
        }
        .navigationTitle("Approvals")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Publication Approval Gate")
                .font(.largeTitle.bold())
            Text("Public export and publication remain blocked until all required human approval checkpoints are complete.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Label(workflow.isApprovedForExport ? "Approved for Export" : "Approval Required", systemImage: workflow.isApprovedForExport ? "checkmark.seal.fill" : "lock.shield.fill")
                .font(.headline)
                .foregroundStyle(workflow.isApprovedForExport ? .green : .orange)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var checkpointList: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(workflow.checkpoints) { checkpoint in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: iconName(for: checkpoint.decision))
                            .foregroundStyle(color(for: checkpoint.decision))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(checkpoint.title)
                                .font(.headline)
                            Text(checkpoint.role.rawValue.capitalized)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(checkpoint.decision.rawValue.capitalized)
                            .font(.caption.bold())
                            .foregroundStyle(color(for: checkpoint.decision))
                    }

                    HStack {
                        Button("Approve") { update(checkpoint, decision: .approved) }
                            .buttonStyle(.borderedProminent)
                        Button("Request Changes") { update(checkpoint, decision: .changesRequested) }
                            .buttonStyle(.bordered)
                    }
                }
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }

    private func update(_ checkpoint: PublishingApprovalCheckpoint, decision: PublishingApprovalDecision) {
        guard let index = workflow.checkpoints.firstIndex(where: { $0.id == checkpoint.id }) else { return }
        var updated = checkpoint
        updated.decision = decision
        updated.decidedAt = .now
        workflow.checkpoints[index] = updated
    }

    private func iconName(for decision: PublishingApprovalDecision) -> String {
        switch decision {
        case .pending: return "clock.fill"
        case .approved: return "checkmark.circle.fill"
        case .changesRequested: return "exclamationmark.triangle.fill"
        case .rejected: return "xmark.octagon.fill"
        }
    }

    private func color(for decision: PublishingApprovalDecision) -> Color {
        switch decision {
        case .pending: return .secondary
        case .approved: return .green
        case .changesRequested: return .orange
        case .rejected: return .red
        }
    }
}

#Preview {
    NavigationStack {
        PublishingApprovalView()
    }
}
