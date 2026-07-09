import SwiftData
import SwiftUI

struct DesignStudioWorkflowView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \DesignStudioProjectRecord.updatedAt, order: .reverse) private var projects: [DesignStudioProjectRecord]
    @Query(sort: \ProductionAssetRecord.updatedAt, order: .reverse) private var assets: [ProductionAssetRecord]
    @Query(sort: \KnowledgeVaultRecord.updatedAt, order: .reverse) private var knowledgeRecords: [KnowledgeVaultRecord]
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]

    private let factory = DesignStudioProjectFactory()
    private let assetService = ProductionAssetService()

    var body: some View {
        NavigationStack {
            List {
                Section("Design Studio Production") {
                    LabeledContent("Projects", value: "\(projects.count)")
                    LabeledContent("Workflow records", value: "\(workflows.count)")
                    LabeledContent("Tasks", value: "\(tasks.count)")
                    LabeledContent("Queue items", value: "\(queueItems.count)")
                    LabeledContent("Assets", value: "\(assets.count)")
                    LabeledContent("Knowledge records", value: "\(knowledgeRecords.count)")
                }

                Section("Projects") {
                    if projects.isEmpty {
                        Text("No Design Studio projects yet. Create a production project to validate automatic workflow, task, queue, asset, and Knowledge Vault generation.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(projects) { project in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(project.title).font(.headline)
                                Text(project.summary)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text("Workflow: \(project.workflowID)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("Production Assets") {
                    if assets.isEmpty {
                        Text("No assets generated yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(assets.prefix(6)) { asset in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(asset.title).font(.headline)
                                Text("\(asset.assetType) • \(asset.status) • \(asset.accessLevel)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("Knowledge Vault Context") {
                    if knowledgeRecords.isEmpty {
                        Text("No project context stored yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(knowledgeRecords) { record in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(record.customerName).font(.headline)
                                Text(record.projectContext)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if !record.brandProfile.isEmpty {
                                    Text(record.brandProfile)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Design Studio")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Create") { createProductionProject() }
                }
            }
            .task { seedIfNeeded() }
        }
    }

    private func seedIfNeeded() {
        guard projects.isEmpty else { return }
        createProductionProject()
    }

    private func createProductionProject() {
        let package = factory.createProjectPackage(
            customerName: "MMG Demo Customer",
            title: "Creator Education Starter Guide",
            summary: "Design Studio project created through the production runtime path.",
            brandProfile: "MMG premium blue/black creator education brand system."
        )

        modelContext.insert(package.knowledge)
        modelContext.insert(package.workflow)
        modelContext.insert(package.task)
        modelContext.insert(package.queueItem)
        modelContext.insert(package.project)
        assetService.createInitialAssets(for: package.project).forEach { modelContext.insert($0) }
        try? modelContext.save()
    }
}

#Preview {
    DesignStudioWorkflowView()
        .modelContainer(for: [
            DesignStudioProjectRecord.self,
            ProductionAssetRecord.self,
            KnowledgeVaultRecord.self,
            WorkflowRecord.self,
            TaskRecord.self,
            ProductionQueueRecord.self
        ], inMemory: true)
}
