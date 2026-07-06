import SwiftUI

struct SystemSettingsView: View {
    let projectStore: LocalProjectStore

    var body: some View {
        NavigationStack {
            List {
                Section("Application") {
                    LabeledContent("Name", value: AppTheme.appName)
                    LabeledContent("Company", value: AppTheme.companyName)
                    LabeledContent("Minimum iOS", value: AppTheme.minimumIOSVersion)
                }

                Section("Build Status") {
                    Label("GitHub connected", systemImage: "checkmark.seal")
                    Label("Native SwiftUI scaffold active", systemImage: "iphone")
                    Label("Local JSON persistence active", systemImage: "externaldrive.badge.checkmark")
                    LabeledContent("Stored records", value: "\(projectStore.projects.count)")
                }

                Section("Next Engineering Targets") {
                    Label("Create/edit project forms", systemImage: "square.and.pencil")
                    Label("Authentication shell", systemImage: "lock.shield")
                    Label("Quality gate workflows", systemImage: "checkmark.rectangle.stack")
                    Label("Release package builder", systemImage: "archivebox")
                }
            }
            .navigationTitle("System")
        }
    }
}

#Preview {
    SystemSettingsView(projectStore: LocalProjectStore())
}
