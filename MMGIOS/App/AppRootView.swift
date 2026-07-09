import SwiftData
import SwiftUI

struct AppRootView: View {
    let sessionStore: LocalSessionStore

    init(sessionStore: LocalSessionStore = LocalSessionStore()) {
        self.sessionStore = sessionStore
    }

    var body: some View {
        TabView {
            CustomerValueOverviewView()
                .tabItem {
                    Label("Value", systemImage: "person.crop.square.filled.and.at.rectangle")
                }

            CustomerPortalView(
                sessionStore: sessionStore,
                customerStore: LocalCustomerPortalStore()
            )
            .tabItem {
                Label("Customer", systemImage: "person.text.rectangle")
            }

            CommandCenterView()
                .tabItem {
                    Label("Command", systemImage: "square.grid.2x2")
                }

            WorkflowRuntimeDashboardView()
                .tabItem {
                    Label("Workflow", systemImage: "point.3.connected.trianglepath.dotted")
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
            PersistedValueDiscoveryProfile.self,
            WorkflowRecord.self,
            WorkflowTransitionRecord.self,
            TaskRecord.self,
            TaskDependencyRecord.self
        ], inMemory: true)
}
