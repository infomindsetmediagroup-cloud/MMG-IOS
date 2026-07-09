import SwiftData
import SwiftUI

struct AppRootView: View {
    private let sessionStore = LocalSessionStore()
    private let customerStore = LocalCustomerPortalStore()

    var body: some View {
        TabView {
            CommandCenterRuntimeSummaryView()
                .tabItem {
                    Label("Command", systemImage: "square.grid.2x2")
                }

            WorkflowRuntimeDashboardView()
                .tabItem {
                    Label("Workflow", systemImage: "point.3.connected.trianglepath.dotted")
                }

            CustomerPortalView(sessionStore: sessionStore, customerStore: customerStore)
                .tabItem {
                    Label("Customer", systemImage: "person.crop.circle")
                }

            DesignStudioWorkflowView()
                .tabItem {
                    Label("Studio", systemImage: "paintbrush.pointed")
                }

            AssetManagementDashboardView()
                .tabItem {
                    Label("Assets", systemImage: "shippingbox")
                }

            DeliverablesDashboardView()
                .tabItem {
                    Label("Deliver", systemImage: "checkmark.seal")
                }

            CustomerReleaseDashboardView()
                .tabItem {
                    Label("Release", systemImage: "paperplane")
                }

            IntegrationConnectorDashboardView()
                .tabItem {
                    Label("Integrations", systemImage: "link.circle")
                }
        }
        .tint(.mmgBlue)
    }
}

#Preview("Runtime Shell") {
    AppRootView()
        .modelContainer(for: [
            WorkflowRecord.self,
            WorkflowTransitionRecord.self,
            TaskRecord.self,
            TaskDependencyRecord.self,
            ProductionQueueRecord.self,
            DesignStudioProjectRecord.self,
            ProductionAssetRecord.self,
            DeliverableRecord.self,
            CustomerReleaseRecord.self,
            IntegrationConnectorRecord.self,
            PersistedCustomerRequestRecord.self,
            PersistedValueDiscoveryProfile.self,
            KnowledgeVaultRecord.self
        ], inMemory: true)
}
