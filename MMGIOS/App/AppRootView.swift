import SwiftData
import SwiftUI

struct AppRootView: View {
    var body: some View {
        TabView {
            CustomerValueOverviewView()
                .tabItem {
                    Label("Value", systemImage: "person.crop.square.filled.and.at.rectangle")
                }

            CustomerPortalView(
                sessionStore: LocalSessionStore(),
                customerStore: LocalCustomerPortalStore()
            )
            .tabItem {
                Label("Customer", systemImage: "person.text.rectangle")
            }

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
        .modelContainer(for: [
            PersistedCustomerRequestRecord.self,
            PersistedValueDiscoveryProfile.self
        ], inMemory: true)
}
