import SwiftUI

struct SystemSettingsView: View {
    let projectStore: LocalProjectStore
    let sessionStore: LocalSessionStore

    var body: some View {
        NavigationStack {
            List {
                Section("Application") {
                    LabeledContent("Name", value: AppTheme.appName)
                    LabeledContent("Company", value: AppTheme.companyName)
                    LabeledContent("Minimum iOS", value: AppTheme.minimumIOSVersion)
                }

                Section("Session") {
                    LabeledContent("User", value: sessionStore.session.user.name)
                    LabeledContent("Email", value: sessionStore.session.user.email)
                    LabeledContent("Role", value: sessionStore.session.user.role.rawValue)

                    Button(role: .destructive) {
                        sessionStore.signOut()
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                Section("Build Status") {
                    Label("GitHub connected", systemImage: "checkmark.seal")
                    Label("Native SwiftUI scaffold active", systemImage: "iphone")
                    Label("Local JSON persistence active", systemImage: "externaldrive.badge.checkmark")
                    Label("Authentication shell active", systemImage: "lock.shield")
                    LabeledContent("Stored records", value: "\(projectStore.projects.count)")
                }

                Section("Next Engineering Targets") {
                    Label("Role-gated navigation", systemImage: "person.crop.circle.badge.checkmark")
                    Label("Customer Portal workspace", systemImage: "person.text.rectangle")
                    Label("Release package builder", systemImage: "archivebox")
                    Label("Cloud sync adapter", systemImage: "icloud")
                }
            }
            .navigationTitle("System")
        }
    }
}

#Preview {
    SystemSettingsView(projectStore: LocalProjectStore(), sessionStore: LocalSessionStore())
}
