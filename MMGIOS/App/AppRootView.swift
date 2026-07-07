import SwiftUI

struct AppRootView: View {
    var body: some View {
        TabView {
            CommandCenterView()
                .tabItem {
                    Label("Command", systemImage: "square.grid.2x2")
                }

            AdminOperationsView()
                .tabItem {
                    Label("Admin", systemImage: "building.2")
                }

            ProductionCommandCenterView()
                .tabItem {
                    Label("Production", systemImage: "shippingbox")
                }

            GrowthMarketingView()
                .tabItem {
                    Label("Growth", systemImage: "chart.line.uptrend.xyaxis")
                }

            SystemSettingsView()
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
