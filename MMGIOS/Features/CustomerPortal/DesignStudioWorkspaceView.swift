import SwiftData
import SwiftUI

struct DesignStudioWorkspaceView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedDesignStudioProject.updatedAt, order: .reverse) private var projects: [PersistedDesignStudioProject]
    @Query(sort: \PersistedDesignStudioAsset.updatedAt, order: .reverse) private var assets: [PersistedDesignStudioAsset]
    @Query(sort: \PersistedDesignStudioVersionRecord.createdAt, order: .reverse) private var versions: [PersistedDesignStudioVersionRecord]
    @Query(sort: \PersistedDesignStudioExportJob.updatedAt, order: .reverse) private var exportJobs: [PersistedDesignStudioExportJob]
    @Query(sort: \PersistedDesignStudioPermissionRecord.updatedAt, order: .reverse) private var permissions: [PersistedDesignStudioPermissionRecord]

    @State private var showingProjectEditor = false
    @State private var showingAssetEditor = false

    private var activeProjects: [PersistedDesignStudioProject] {
        projects.filter { $0.statusRawValue != DesignStudioProjectStatus.archived.rawValue }
    }

    private var approvalRequiredJobs: [PersistedDesignStudioExportJob] {
        exportJobs.filter { $0.approvalRequired && $0.statusRawValue != DesignStudioExportStatus.released.rawValue }
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
                LabeledContent("Version records", value: "\(versions.count)")
                LabeledContent("Export jobs", value: "\(exportJobs.count)")
                LabeledContent("Permission records", value: "\(permissions.count)")
                LabeledContent("Approval gates", value: "\(approvalRequiredJobs.count)")
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
                        NavigationLink {
                            DesignStudioProjectDetailView(project: project)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(project.title).font(.headline)
                                Text("\(project.projectTypeRawValue) • \(project.statusRawValue)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(project.summary)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text("ID: \(project.relationshipID)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text("Vault: \(project.knowledgeVaultKey.isEmpty ? "Not linked" : project.knowledgeVaultKey)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
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
                        NavigationLink {
                            DesignStudioAssetDetailView(asset: asset)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(asset.title).font(.headline)
                                Text("\(asset.assetTypeRawValue) • \(asset.statusRawValue) • \(asset.versionLabel)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(asset.storagePath)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text("Project ID: \(asset.projectRelationshipID.isEmpty ? "fallback title link" : asset.projectRelationshipID)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                if !asset.kairosHistorySummary.isEmpty {
                                    Text("Kairos: \(asset.kairosHistorySummary)")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }

            Section("Version History") {
                if versions.isEmpty {
                    Text("No version records yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(versions) { version in
                        VStack(alignment: .leading, spacing: 5) {
                            Text("\(version.assetTitle) • \(version.versionLabel)")
                                .font(.headline)
                            Text(version.changeSummary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("Changed by \(version.changedBy)\(version.kairosAssisted ? " with Kairos assistance" : "")")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Export Jobs") {
                if exportJobs.isEmpty {
                    Text("No export jobs yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(exportJobs) { job in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(job.assetTitle).font(.headline)
                            Text("\(job.requestedFormat) • \(job.statusRawValue)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(job.destinationPath)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            if job.approvalRequired {
                                Label("Approval required before customer release", systemImage: "checkmark.seal")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("Permissions") {
                if permissions.isEmpty {
                    Text("No permission records yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(permissions) { permission in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(permission.principalName).font(.headline)
                            Text("\(permission.projectTitle) • \(permission.permissionLevelRawValue)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("Export approved deliverables: \(permission.canExportApprovedDeliverables ? "Yes" : "No") • Intermediate assets: \(permission.canAccessIntermediateAssets ? "Yes" : "No")")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Design Studio")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showingProjectEditor = true } label: {
                    Label("New Project", systemImage: "folder.badge.plus")
                }

                Button { showingAssetEditor = true } label: {
                    Label("New Asset", systemImage: "doc.badge.plus")
                }

                Button("Seed") { seedDesignStudioIfNeeded() }
            }
        }
        .sheet(isPresented: $showingProjectEditor) {
            DesignStudioProjectEditorView()
        }
        .sheet(isPresented: $showingAssetEditor) {
            DesignStudioAssetEditorView(
                defaultProjectTitle: projects.first?.title ?? "",
                defaultProjectRelationshipID: projects.first?.relationshipID ?? ""
            )
        }
        .task { seedDesignStudioIfNeeded() }
    }

    private func seedDesignStudioIfNeeded() {
        guard projects.isEmpty, assets.isEmpty, versions.isEmpty, exportJobs.isEmpty, permissions.isEmpty else { return }

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

        let manuscriptAsset = PersistedDesignStudioAsset(
            projectRelationshipID: bookProject.relationshipID,
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

        let thumbnailAsset = PersistedDesignStudioAsset(
            projectRelationshipID: imageProject.relationshipID,
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

        modelContext.insert(manuscriptAsset)
        modelContext.insert(thumbnailAsset)

        modelContext.insert(PersistedDesignStudioVersionRecord(projectRelationshipID: bookProject.relationshipID, assetRelationshipID: manuscriptAsset.relationshipID, assetTitle: manuscriptAsset.title, projectTitle: bookProject.title, versionLabel: "v1", changeSummary: "Initial uploaded manuscript captured for editing, formatting, and export preparation.", changedBy: "MMG Demo Customer"))
        modelContext.insert(PersistedDesignStudioVersionRecord(projectRelationshipID: imageProject.relationshipID, assetRelationshipID: thumbnailAsset.relationshipID, assetTitle: thumbnailAsset.title, projectTitle: imageProject.title, versionLabel: "v1", changeSummary: "First Kairos-assisted thumbnail concept generated from customer brand kit and launch objective.", changedBy: "Kairos", kairosAssisted: true))

        modelContext.insert(PersistedDesignStudioExportJob(projectRelationshipID: bookProject.relationshipID, assetRelationshipID: manuscriptAsset.relationshipID, assetTitle: manuscriptAsset.title, projectTitle: bookProject.title, requestedFormat: "PDF", destinationPath: "/customers/demo/exports/creator-education-starter-guide-v1.pdf", status: .readyForReview, requestedBy: "Kairos", approvalRequired: true, releaseNotes: "Export requires approval before becoming a customer deliverable."))
        modelContext.insert(PersistedDesignStudioExportJob(projectRelationshipID: imageProject.relationshipID, assetRelationshipID: thumbnailAsset.relationshipID, assetTitle: thumbnailAsset.title, projectTitle: imageProject.title, requestedFormat: "PNG 9:16", destinationPath: "/customers/demo/exports/launch-thumbnail-v1.png", status: .queued, requestedBy: "MMG Internal", approvalRequired: true, releaseNotes: "Generated intermediate asset remains in-house until approved."))

        modelContext.insert(PersistedDesignStudioPermissionRecord(projectRelationshipID: bookProject.relationshipID, customerName: "MMG Demo Customer", projectTitle: bookProject.title, principalName: "MMG Demo Customer", permissionLevel: .reviewer, canExportApprovedDeliverables: true, canAccessIntermediateAssets: false))
        modelContext.insert(PersistedDesignStudioPermissionRecord(projectRelationshipID: imageProject.relationshipID, customerName: "MMG Demo Customer", projectTitle: imageProject.title, principalName: "MMG Production", permissionLevel: .productionOnly, canExportApprovedDeliverables: true, canAccessIntermediateAssets: true))

        try? modelContext.save()
    }

    private func iconName(for module: DesignStudioProjectType) -> String {
        switch module {
        case .document: return "doc.text"
        case .image: return "photo"
        case .video: return "video"
        case .website: return "globe"
        case .brand: return "paintpalette"
        case .aiWorkspace: return "sparkles"
        }
    }
}

#Preview {
    NavigationStack {
        DesignStudioWorkspaceView()
    }
    .modelContainer(for: [
        PersistedDesignStudioProject.self,
        PersistedDesignStudioAsset.self,
        PersistedDesignStudioVersionRecord.self,
        PersistedDesignStudioExportJob.self,
        PersistedDesignStudioPermissionRecord.self
    ], inMemory: true)
}
