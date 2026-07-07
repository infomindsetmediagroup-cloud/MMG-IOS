import SwiftUI

struct SystemSettingsView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Application") {
                    Text(AppTheme.appName)
                    Text(AppTheme.companyName)
                    Text("iOS " + AppTheme.minimumIOSVersion)
                }

                Section("Status") {
                    Label("Native SwiftUI scaffold active", systemImage: "iphone")
                    Label("Manual build verification active", systemImage: "hammer")
                    Label("Shared Xcode scheme committed", systemImage: "square.stack.3d.up")
                }
            }
            .navigationTitle("System")
        }
    }
}

#Preview {
    SystemSettingsView()
}
