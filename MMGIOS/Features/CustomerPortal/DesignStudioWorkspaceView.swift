import SwiftData
import SwiftUI

struct DesignStudioWorkspaceView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedDesignStudioProject.updatedAt, order: .reverse) private var projects: [PersistedDesignStudioProject]
    @Query(sort: \PersistedDesignStudioAsset.updatedAt, order: .reverse) private var assets: [PersistedDesignStudioAsset]

    private var activeProjects: [PersistedDesignStudioProject] {
        projects.filter { $0.statusRawValue != DesignStudioProjectStatus.archived.rawValue }
    }

    private var exportReadyAssets: [PersistedDesignStudioAsset] {
        assets.filter { $0.statusRawValue == DesignStudioAssetStatus.exported.rawValue || $0.exportFormat.isEmpty == false }
    }

    var body: some View {
        List {
            Section {
                SectionHeader(
                    eyebrow: "Production Workspace",
                    title: "Design Studio",
                    bodyText: "Create, edit, generate, manage, version, and export customer production assets inside the MMG/Kairos portal. Intermediate assets stay inside the ecosystem unless explicitly released as approved deliverables."
                )
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }

            Section("Studio Status") {
                LabeledContent("Active projects", value: "\(activeProjects.count)")
                LabeledContent("Managed assets", value: "\(assets.count)")
                LabeledContent("Export-ready assets", value: "\(exportReadyAssets.count)")
                Label("Kairos-assisted production routing enabled", systemImage: "sparkles")
            }

            Section("Project Modules") {
                ForEach(DesignStudioProjectType.allCases) { module in
                    Label(module.rawValue, systemImage: iconName(for: module))
                }
            }

            Section("Projects") {
                if projects.isEmpty {
                    Text("No Design Studio projects yet. Seed demo records to validate the backend model.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(projects) { project in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(project.title).font(.headline)
                            Text("\(project.projectTypeRawValue) • \(project.statusRawValue)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(project.summary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Assets") {
                if assets.isEmpty {
                    Text("No Design Studio assets yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(assets) { asset in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(asset.title).font(.headline)
                            Text("\(asset.assetTypeRawValue) • \(asset.statusRawValue) • \(asset.versionLabel)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(asset.storagePath)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Design Studio")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Seed") { seedDesignStudioIfNeeded() }
            }
        }
        .task { seedDesignStudioIfNeeded() }
    }

    private func seedDesignStudioIfNeeded() {
        guard projects.isEmpty, assets.isEmpty else { return }

        let bookProject = PersistedDesignStudioProject(
            title: "Creator Education Starter Guide",
            customerName: "MMG Demo Customer",
            projectType: .document,
            status: .active,
            summary: "Document/book project used to test writing, formatting, versioning, export jobs, and Kairos-assisted refinement.",
            brandKitKey: "demo-brand-kit",
            knowledgeVaultKey: "customer-knowledge-vault/demo-customer"
        )

        let imageProject = PersistedDesignStudioProject(
            title: "Launch Social Asset Set",
            customerName: "MMG Demo Customer",
            projectType: .image,
            status: .review,
            summary: "Image/social asset project used to validate visual asset storage, version history, brand-kit reuse, and export readiness.",
            brandKitKey: "demo-brand-kit",
            knowledgeVaultKey: "customer-knowledge-vault/demo-customer"
        )

        modelContext.insert(bookProject)
        modelContext.insert(imageProject)

        modelContext.insert(
            PersistedDesignStudioAsset(
                title: "Starter Guide Draft Manuscript",
                projectTitle: bookProject.title,
                assetType: .manuscript,
                status: .editing,
                sourceDescription: "Customer-uploaded source draft prepared for Kairos refinement.",
                storagePath: "/customers/demo/design-studio/creator-education-starter-guide/manuscript-v1.md",
                exportFormat: "PDF",
                versionLabel: "v1",
                kairosHistorySummary: "Ready for rewrite, formatting, and export preparation."
            )
        )

        modelContext.insert(
            PersistedDesignStudioAsset(
                title: "Launch Thumbnail Concept",
                projectTitle: imageProject.title,
                assetType: .socialGraphic,
                status: .generated,
                sourceDescription: "Kairos-generated visual concept retained inside the MMG/Kairos production workspace.",
                storagePath: "/customers/demo/design-studio/launch-social-asset-set/thumbnail-v1.png",
                exportFormat: "PNG 9:16",
                versionLabel: "v1",
                kairosHistorySummary: "Generated from customer brand kit and launch objective."
            )
        )

        try? modelContext.save()
    }

    private func iconName(for module: DesignStudioProjectType) -> String {
        switch module {
        case .document:
            return "doc.text"
        case .image:
            return "photo"
        case .video:
            return "video"
        case .website:
            return "globe"
        case .brand:
            return "paintpalette"
        case .aiWorkspace:
            return "sparkles"
        }
    }
}

#Preview {
    NavigationStack {
        DesignStudioWorkspaceView()
    }
    .modelContainer(for: [
        PersistedDesignStudioProject.self,
        PersistedDesignStudioAsset.self
    ], inMemory: true)
}
