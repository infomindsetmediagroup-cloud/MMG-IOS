import SwiftUI

struct CommandCenterView: View {
    let projectStore: LocalProjectStore
    private let columns = [GridItem(.adaptive(minimum: 160), spacing: 14)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    SectionHeader(
                        eyebrow: AppTheme.companyName,
                        title: "Kairos Command Center",
                        bodyText: "A connected operating layer for MMG publishing, production, customer operations, quality control, growth, and release execution."
                    )

                    LazyVGrid(columns: columns, spacing: 14) {
                        MetricCard(metric: OperationalMetric(title: "Active Projects", value: "\(projectStore.activeProjects.count)", caption: "Open Kairos records", systemImage: "folder.badge.gearshape"))
                        MetricCard(metric: OperationalMetric(title: "Blocked", value: "\(projectStore.blockedProjects.count)", caption: "Requires intervention", systemImage: "exclamationmark.triangle"))
                        ForEach(CommandCenterRegistry.metrics.prefix(2)) { metric in
                            MetricCard(metric: metric)
                        }
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Text("Priority Workflow")
                            .font(.title2.bold())

                        ForEach(projectStore.activeProjects.prefix(4)) { project in
                            ProjectCard(project: project)
                        }
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Text("Foundational Centers")
                            .font(.title2.bold())

                        ForEach(CommandCenterRegistry.commandCenters) { center in
                            CommandCenterCard(center: center)
                        }
                    }
                }
                .padding(20)
            }
            .background(
                LinearGradient(
                    colors: [Color.white, Color.mmgSurface],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .navigationTitle("Kairos")
        }
    }
}

#Preview {
    CommandCenterView(projectStore: LocalProjectStore())
}
