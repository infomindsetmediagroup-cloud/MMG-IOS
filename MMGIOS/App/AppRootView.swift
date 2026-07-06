import SwiftUI

struct AppRootView: View {
    let sessionStore: LocalSessionStore
    @State private var projectStore = LocalProjectStore()
    @State private var qualityStore = LocalQualityStore()

    var body: some View {
        TabView {
            CommandCenterView(projectStore: projectStore)
                .tabItem {
                    Label("Command", systemImage: "square.grid.2x2")
                }

            ProjectBoardView(projectStore: projectStore)
                .tabItem {
                    Label("Projects", systemImage: "folder")
                }

            ProductionCommandCenterView(projectStore: projectStore)
                .tabItem {
                    Label("Production", systemImage: "shippingbox")
                }

            QualityReleaseView(projectStore: projectStore, qualityStore: qualityStore)
                .tabItem {
                    Label("Quality", systemImage: "checkmark.seal")
                }

            GrowthMarketingView(projectStore: projectStore)
                .tabItem {
                    Label("Growth", systemImage: "chart.line.uptrend.xyaxis")
                }

            SystemSettingsView(projectStore: projectStore, sessionStore: sessionStore)
                .tabItem {
                    Label("System", systemImage: "gearshape")
                }
        }
        .tint(.mmgBlue)
    }
}

#Preview {
    AppRootView(sessionStore: LocalSessionStore())
}
