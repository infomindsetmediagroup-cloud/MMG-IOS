import SwiftData
import SwiftUI

struct DesignStudioProjectDetailView: View {
    let project: PersistedDesignStudioProject

    @Query(sort: \PersistedDesignStudioAsset.updatedAt, order: .reverse) private var allAssets: [PersistedDesignStudioAsset]
    @Query(sort: \PersistedDesignStudioVersionRecord.createdAt, order: .reverse) private var allVersions: [PersistedDesignStudioVersionRecord]
    @Query(sort: \PersistedDesignStudioExportJob.updatedAt, order: .reverse) private var allExportJobs: [PersistedDesignStudioExportJob]
    @Query(sort: \PersistedDesignStudioPermissionRecord.updatedAt, order: .reverse) private var allPermissions: [PersistedDesignStudioPermissionRecord]

    private var projectAssets: [PersistedDesignStudioAsset] {
        allAssets.filter { $0.projectTitle == project.title }
    }

    private var projectVersions: [PersistedDesignStudioVersionRecord] {
        allVersions.filter { $0.projectTitle == project.title }
    }

    private var projectExportJobs: [PersistedDesignStudioExportJob] {
        allExportJobs.filter { $0.projectTitle == project.title }
    }

    private var projectPermissions: [PersistedDesignStudioPermissionRecord] {
        allPermissions.filter { $0.projectTitle == project.title }
    }

    var body: some View {
        List {
            Section("Project") {
                LabeledContent("Customer", value: project.customerName)
                LabeledContent("Type", value: project.projectTypeRawValue)
                LabeledContent("Status", value: project.statusRawValue)
                LabeledContent("Brand kit", value: project.brandKitKey.isEmpty ? "Not linked" : project.brandKitKey)
                LabeledContent("Knowledge Vault", value: project.knowledgeVaultKey.isEmpty ? "Not linked" : project.knowledgeVaultKey)
                Text(project.summary)
                    .foregroundStyle(.secondary)
            }

            Section("Production Counts") {
                LabeledContent("Assets", value: "\(projectAssets.count)")
                LabeledContent("Versions", value: "\(projectVersions.count)")
                LabeledContent("Export jobs", value: "\(projectExportJobs.count)")
                LabeledContent("Permissions", value: "\(projectPermissions.count)")
            }

            Section("Assets") {
                if projectAssets.isEmpty {
                    Text("No assets linked to this project yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(projectAssets) { asset in
                        NavigationLink {
                            DesignStudioAssetDetailView(asset: asset)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(asset.title).font(.headline)
                                Text("\(asset.assetTypeRawValue) • \(asset.statusRawValue) • \(asset.versionLabel)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("Export Jobs") {
                if projectExportJobs.isEmpty {
                    Text("No export jobs for this project yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(projectExportJobs) { job in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(job.assetTitle).font(.headline)
                            Text("\(job.requestedFormat) • \(job.statusRawValue)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if job.approvalRequired {
                                Label("Approval required", systemImage: "checkmark.seal")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("Permissions") {
                if projectPermissions.isEmpty {
                    Text("No permissions linked to this project yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(projectPermissions) { permission in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(permission.principalName).font(.headline)
                            Text(permission.permissionLevelRawValue)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(project.title)
    }
}

struct DesignStudioAssetDetailView: View {
    let asset: PersistedDesignStudioAsset

    @Query(sort: \PersistedDesignStudioVersionRecord.createdAt, order: .reverse) private var allVersions: [PersistedDesignStudioVersionRecord]
    @Query(sort: \PersistedDesignStudioExportJob.updatedAt, order: .reverse) private var allExportJobs: [PersistedDesignStudioExportJob]

    private var assetVersions: [PersistedDesignStudioVersionRecord] {
        allVersions.filter { $0.assetTitle == asset.title && $0.projectTitle == asset.projectTitle }
    }

    private var assetExportJobs: [PersistedDesignStudioExportJob] {
        allExportJobs.filter { $0.assetTitle == asset.title && $0.projectTitle == asset.projectTitle }
    }

    var body: some View {
        List {
            Section("Asset") {
                LabeledContent("Project", value: asset.projectTitle)
                LabeledContent("Type", value: asset.assetTypeRawValue)
                LabeledContent("Status", value: asset.statusRawValue)
                LabeledContent("Version", value: asset.versionLabel)
                LabeledContent("Export format", value: asset.exportFormat.isEmpty ? "Not set" : asset.exportFormat)
                Text(asset.sourceDescription)
                    .foregroundStyle(.secondary)
            }

            Section("Storage") {
                Text(asset.storagePath)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Kairos History") {
                Text(asset.kairosHistorySummary.isEmpty ? "No Kairos history recorded yet." : asset.kairosHistorySummary)
                    .foregroundStyle(.secondary)
            }

            Section("Version History") {
                if assetVersions.isEmpty {
                    Text("No versions linked to this asset yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(assetVersions) { version in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(version.versionLabel).font(.headline)
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
                if assetExportJobs.isEmpty {
                    Text("No export jobs linked to this asset yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(assetExportJobs) { job in
                        VStack(alignment: .leading, spacing: 5) {
                            Text("\(job.requestedFormat) • \(job.statusRawValue)")
                                .font(.headline)
                            Text(job.destinationPath)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(job.releaseNotes.isEmpty ? "No release notes." : job.releaseNotes)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(asset.title)
    }
}
