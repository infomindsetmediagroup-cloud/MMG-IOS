import SwiftUI

struct ProjectCard: View {
    let project: KairosProject

    var completedTaskCount: Int {
        project.tasks.filter(\.isComplete).count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(project.area.rawValue.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.mmgBlue)
                        .tracking(1)

                    Text(project.title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                }

                Spacer()

                Text(project.priority.rawValue)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(priorityColor.opacity(0.14), in: Capsule())
                    .foregroundStyle(priorityColor)
            }

            Text(project.summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Label(project.status.rawValue, systemImage: "circle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor)

                Spacer()

                Text("\(completedTaskCount)/\(project.tasks.count) tasks")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .background(Color.mmgSurface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var statusColor: Color {
        switch project.status {
        case .intake, .ready:
            return .mmgBlue
        case .inProgress:
            return .orange
        case .review:
            return .purple
        case .blocked:
            return .red
        case .complete:
            return .green
        }
    }

    private var priorityColor: Color {
        switch project.priority {
        case .critical:
            return .red
        case .high:
            return .orange
        case .standard:
            return .mmgBlue
        case .low:
            return .secondary
        }
    }
}
