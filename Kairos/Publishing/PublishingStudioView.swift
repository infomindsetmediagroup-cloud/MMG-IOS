import SwiftUI

public struct PublishingStudioView: View {
    @State private var project: PublishingProject
    @State private var selectedStage: PublishingStage

    public init(project: PublishingProject = .sample) {
        _project = State(initialValue: project)
        _selectedStage = State(initialValue: project.currentStage)
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    readinessCard
                    workflowCard
                    formatCard
                    validationCard
                }
                .padding(20)
            }
            .navigationTitle("Publishing Studio")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(project.title)
                .font(.largeTitle.bold())
            if !project.subtitle.isEmpty {
                Text(project.subtitle)
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            Text("Author: \(project.authorName)")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var readinessCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Publishing Readiness")
                        .font(.headline)
                    Text("Live completion across metadata, manuscript, cover, interior, QA, and approvals.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(project.readiness.overall)%")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
            }

            readinessRow("Metadata", project.readiness.metadata)
            readinessRow("Manuscript", project.readiness.manuscript)
            readinessRow("Cover", project.readiness.cover)
            readinessRow("Interior", project.readiness.interior)
            readinessRow("QA", project.readiness.qa)
            readinessRow("Approval", project.readiness.approval)
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func readinessRow(_ title: String, _ value: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(value)%")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: Double(value), total: 100)
        }
    }

    private var workflowCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Interactive Pipeline")
                .font(.headline)
            ForEach(PublishingStage.allCases) { stage in
                HStack(spacing: 12) {
                    Image(systemName: stage == project.currentStage ? "largecircle.fill.circle" : "circle")
                        .foregroundStyle(stage == project.currentStage ? .blue : .secondary)
                    Text(stage.title)
                        .font(.subheadline.weight(stage == project.currentStage ? .bold : .regular))
                    Spacer()
                }
                .contentShape(Rectangle())
                .onTapGesture { selectedStage = stage }
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var formatCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Output Formats")
                .font(.headline)
            ForEach(PublishingFormat.allCases) { format in
                HStack {
                    Image(systemName: project.formats.contains(format) ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(project.formats.contains(format) ? .green : .secondary)
                    Text(format.displayName)
                    Spacer()
                    if format == .paperback {
                        Text("Template-driven")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    if format == .hardcover {
                        Text("Reserved")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
                .font(.subheadline)
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var validationCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Production Validation")
                .font(.headline)
            if project.validationIssues.isEmpty {
                Label("No active blockers", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green)
            } else {
                ForEach(project.validationIssues) { issue in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(issue.title)
                                .font(.subheadline.bold())
                            Spacer()
                            Text(issue.severity.rawValue.uppercased())
                                .font(.caption2.bold())
                                .foregroundStyle(issue.severity == .blocking ? .red : .orange)
                        }
                        Text(issue.message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(12)
                    .background(.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

#Preview {
    PublishingStudioView()
}
