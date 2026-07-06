import SwiftUI

struct SystemSettingsView: View {
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
                    Label("Core command centers seeded", systemImage: "square.grid.2x2")
                }

                Section("Next Engineering Targets") {
                    Label("Local persistence", systemImage: "externaldrive")
                    Label("Authentication shell", systemImage: "lock.shield")
                    Label("Project database models", systemImage: "tablecells")
                    Label("Quality gate workflows", systemImage: "checkmark.rectangle.stack")
                }
            }
            .navigationTitle("System")
        }
    }
}

#Preview {
    SystemSettingsView()
}
