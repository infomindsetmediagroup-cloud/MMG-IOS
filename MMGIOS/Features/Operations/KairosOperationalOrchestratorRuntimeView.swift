import SwiftUI

struct KairosOperationalOrchestratorRuntimeView: View {
    @Environment(KairosRuntime.self) private var runtime

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Operational Orchestrator", systemImage: "arrow.triangle.branch")
                            .font(.title2.weight(.semibold))
                        Text(runtime.state.activeWorkflow)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }

                Section("Daily Operations Run") {
                    ForEach(Array(runtime.dailyRun.enumerated()), id: \.element.id) { index, step in
                        HStack(alignment: .top, spacing: 12) {
                            Text(String(format: "%02d", index + 1))
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.mmgBlue)
                                .frame(width: 30)
                            RuntimeOrchestratorRow(title: step.title, detail: step.detail, systemImage: step.systemImage)
                        }
                    }
                }

                Section("Automation Queue") {
                    ForEach(runtime.automationQueue) { item in
                        RuntimeOrchestratorProgressRow(title: item.title, detail: item.detail, status: item.status.rawValue, progress: item.progress, systemImage: item.systemImage)
                    }
                }

                Section("Approval Queue") {
                    ForEach(runtime.approvalQueue) { item in
                        HStack(alignment: .top) {
                            RuntimeOrchestratorRow(title: item.title, detail: item.detail, systemImage: item.systemImage)
                            Spacer()
                            Text(item.risk.rawValue)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(item.risk == .high ? .orange : .mmgBlue)
                        }
                    }
                }

                Section("Workflow Controller") {
                    ForEach(Array(runtime.workflowSteps.enumerated()), id: \.element.id) { index, step in
                        HStack(alignment: .top, spacing: 12) {
                            Text(String(format: "%02d", index + 1))
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.mmgBlue)
                                .frame(width: 30)
                            RuntimeOrchestratorRow(title: step.title, detail: step.detail, systemImage: step.systemImage)
                        }
                    }
                }
            }
            .navigationTitle("Orchestrator")
        }
    }
}

private struct RuntimeOrchestratorRow: View {
    let title: String
    let detail: String
    let systemImage: String

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(.mmgBlue)
        }
    }
}

private struct RuntimeOrchestratorProgressRow: View {
    let title: String
    let detail: String
    let status: String
    let progress: Double
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Label(title, systemImage: systemImage).font(.headline)
                Spacer()
                Text(status).font(.caption.weight(.semibold))
            }
            Text(detail).font(.caption).foregroundStyle(.secondary)
            ProgressView(value: progress)
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    KairosOperationalOrchestratorRuntimeView()
        .environment(KairosRuntime())
}
