import SwiftUI

struct ProductionCommandCenterView: View {
    let projectStore: LocalProjectStore

    private var productionProjects: [KairosProject] {
        projectStore.projects(in: .production)
    }

    private let stages = [
        "Customer intake received",
        "Asset requirements confirmed",
        "Production package in progress",
        "Quality review pending",
        "Release or customer handoff ready"
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    SectionHeader(
                        eyebrow: "Execution Layer",
                        title: "Production Command Center",
                        bodyText: "A service-delivery workspace for managing customer projects, publishing deliverables, production gates, and internal workload flow."
                    )

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Production Records")
                            .font(.title2.bold())

                        ForEach(productionProjects) { project in
                            NavigationLink {
                                ProjectDetailView(projectStore: projectStore, project: project)
                            } label: {
                                ProjectCard(project: project)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Delivery Stages")
                            .font(.title2.bold())

                        ForEach(Array(stages.enumerated()), id: \.offset) { index, stage in
                            HStack(spacing: 14) {
                                Text("\(index + 1)")
                                    .font(.headline.monospacedDigit())
                                    .foregroundStyle(.white)
                                    .frame(width: 34, height: 34)
                                    .background(.mmgBlue, in: Circle())

                                Text(stage)
                                    .font(.headline)

                                Spacer()
                            }
                            .padding(16)
                            .background(Color.mmgSurface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        }
                    }
                }
                .padding(20)
            }
            .navigationTitle("Production")
        }
    }
}

#Preview {
    ProductionCommandCenterView(projectStore: LocalProjectStore())
}
