import SwiftData
import SwiftUI

struct ProductionCommandCenterView: View {
    let projectStore: LocalProjectStore
    @Query(sort: \PersistedProjectRecord.updatedAt, order: .reverse) private var projects: [PersistedProjectRecord]

    private var productionProjects: [PersistedProjectRecord] {
        projects.filter { $0.areaRawValue == WorkflowArea.production.rawValue }
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
                contentStack
                    .padding(20)
            }
            .navigationTitle("Production")
        }
    }

    private var contentStack: some View {
        VStack(alignment: .leading, spacing: 22) {
            headerSection
            productionRecordsSection
            deliveryStagesSection
        }
    }

    private var headerSection: some View {
        SectionHeader(
            eyebrow: "Execution Layer",
            title: "Production Command Center",
            bodyText: "A service-delivery workspace for managing customer projects, publishing deliverables, production gates, and internal workload flow."
        )
    }

    private var productionRecordsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Production Records")
                .font(.title2.bold())

            if productionProjects.isEmpty {
                Text("No production records yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(productionProjects) { project in
                    NavigationLink {
                        ProjectDetailView(project: project)
                    } label: {
                        PersistedProjectCard(project: project)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var deliveryStagesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Delivery Stages")
                .font(.title2.bold())

            ForEach(Array(stages.enumerated()), id: \.offset) { index, stage in
                DeliveryStageRow(index: index, stage: stage)
            }
        }
    }
}

private struct PersistedProjectCard: View {
    let project: PersistedProjectRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(project.title)
                .font(.headline)
                .foregroundStyle(.primary)

            Text("\(project.areaRawValue) • \(project.statusRawValue) • \(project.priorityRawValue)")
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(project.summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.mmgSurface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

private struct DeliveryStageRow: View {
    let index: Int
    let stage: String

    var body: some View {
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

#Preview {
    ProductionCommandCenterView(projectStore: LocalProjectStore())
        .modelContainer(for: PersistedProjectRecord.self, inMemory: true)
}
