import SwiftUI

struct AppRootView: View {
    @State private var projectStore = LocalProjectStore()

    var body: some View {
        TabView {
            CommandCenterView(projectStore: projectStore)
                .tabItem {
                    Label("Command", systemImage: "square.grid.2x2")
                }

            AdminOperationsView(projectStore: projectStore)
                .tabItem {
                    Label("Admin", systemImage: "building.2")
                }

            ProductionCommandCenterView(projectStore: projectStore)
                .tabItem {
                    Label("Production", systemImage: "shippingbox")
                }

            GrowthMarketingView(projectStore: projectStore)
                .tabItem {
                    Label("Growth", systemImage: "chart.line.uptrend.xyaxis")
                }

            SystemSettingsView(projectStore: projectStore)
                .tabItem {
                    Label("System", systemImage: "gearshape")
                }
        }
        .tint(.mmgBlue)
    }
}

#Preview {
    AppRootView()
}
