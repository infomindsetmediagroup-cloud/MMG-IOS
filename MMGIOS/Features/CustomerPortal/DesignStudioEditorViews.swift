import SwiftData
import SwiftUI

struct DesignStudioProjectEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @State private var title = ""
    @State private var customerName = "MMG Demo Customer"
    @State private var projectType: DesignStudioProjectType = .document
    @State private var status: DesignStudioProjectStatus = .draft
    @State private var summary = ""
    @State private var brandKitKey = ""
    @State private var knowledgeVaultKey = ""

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Project") {
                    TextField("Title", text: $title)
                    TextField("Customer", text: $customerName)
                    Picker("Type", selection: $projectType) {
                        ForEach(DesignStudioProjectType.allCases) { type in
                            Text(type.rawValue).tag(type)
                        }
                    }
                    Picker("Status", selection: $status) {
                        ForEach(DesignStudioProjectStatus.allCases) { status in
                            Text(status.rawValue).tag(status)
                        }
                    }
                }

                Section("Production Links") {
                    TextField("Brand kit key", text: $brandKitKey)
                    TextField("Knowledge Vault key", text: $knowledgeVaultKey)
                }

                Section("Summary") {
                    TextEditor(text: $summary)
                        .frame(minHeight: 120)
                }
            }
            .navigationTitle("New Project")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveProject() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private func saveProject() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let project = PersistedDesignStudioProject(
            title: trimmedTitle,
            customerName: customerName.trimmingCharacters(in: .whitespacesAndNewlines),
            projectType: projectType,
            status: status,
            summary: summary.trimmingCharacters(in: .whitespacesAndNewlines),
            brandKitKey: brandKitKey.trimmingCharacters(in: .whitespacesAndNewlines),
            knowledgeVaultKey: knowledgeVaultKey.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        modelContext.insert(project)
        try? modelContext.save()
        dismiss()
    }
}

struct DesignStudioAssetEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let defaultProjectTitle: String
    let defaultProjectRelationshipID: String

    @State private var title = ""
    @State private var projectTitle: String
    @State private var assetType: DesignStudioAssetType = .template
    @State private var status: DesignStudioAssetStatus = .uploaded
    @State private var sourceDescription = ""
    @State private var storagePath = ""
    @State private var exportFormat = ""
    @State private var versionLabel = "v1"
    @State private var kairosHistorySummary = ""

    init(defaultProjectTitle: String = "", defaultProjectRelationshipID: String = "") {
        self.defaultProjectTitle = defaultProjectTitle
        self.defaultProjectRelationshipID = defaultProjectRelationshipID
        _projectTitle = State(initialValue: defaultProjectTitle)
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !projectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !sourceDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !storagePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Asset") {
                    TextField("Title", text: $title)
                    TextField("Project title", text: $projectTitle)
                    Picker("Type", selection: $assetType) {
                        ForEach(DesignStudioAssetType.allCases) { type in
                            Text(type.rawValue).tag(type)
                        }
                    }
                    Picker("Status", selection: $status) {
                        ForEach(DesignStudioAssetStatus.allCases) { status in
                            Text(status.rawValue).tag(status)
                        }
                    }
                }

                Section("Storage + Export") {
                    TextField("Storage path", text: $storagePath)
                    TextField("Export format", text: $exportFormat)
                    TextField("Version label", text: $versionLabel)
                }

                Section("Source") {
                    TextEditor(text: $sourceDescription)
                        .frame(minHeight: 90)
                }

                Section("Kairos History") {
                    TextEditor(text: $kairosHistorySummary)
                        .frame(minHeight: 90)
                }
            }
            .navigationTitle("New Asset")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveAsset() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private func saveAsset() {
        let asset = PersistedDesignStudioAsset(
            projectRelationshipID: defaultProjectRelationshipID,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            projectTitle: projectTitle.trimmingCharacters(in: .whitespacesAndNewlines),
            assetType: assetType,
            status: status,
            sourceDescription: sourceDescription.trimmingCharacters(in: .whitespacesAndNewlines),
            storagePath: storagePath.trimmingCharacters(in: .whitespacesAndNewlines),
            exportFormat: exportFormat.trimmingCharacters(in: .whitespacesAndNewlines),
            versionLabel: versionLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "v1" : versionLabel.trimmingCharacters(in: .whitespacesAndNewlines),
            kairosHistorySummary: kairosHistorySummary.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        modelContext.insert(asset)
        modelContext.insert(
            PersistedDesignStudioVersionRecord(
                projectRelationshipID: asset.projectRelationshipID,
                assetRelationshipID: asset.relationshipID,
                assetTitle: asset.title,
                projectTitle: asset.projectTitle,
                versionLabel: asset.versionLabel,
                changeSummary: "Asset record created in the Customer Portal Design Studio.",
                changedBy: "MMG Portal",
                kairosAssisted: false
            )
        )
        try? modelContext.save()
        dismiss()
    }
}
