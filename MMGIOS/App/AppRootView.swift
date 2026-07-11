import SwiftData
import SwiftUI

struct AppRootView: View {
    private let sessionStore = LocalSessionStore()
    private let customerStore = LocalCustomerPortalStore()

    var body: some View {
        TabView {
            ExecutiveCommandCenterView()
                .tabItem {
                    Label("Command", systemImage: "square.grid.2x2")
                }

            ExecutiveChatView()
                .tabItem {
                    Label("Chat", systemImage: "message.badge.waveform")
                }

            KnowledgeVaultReviewView()
                .tabItem {
                    Label("Knowledge", systemImage: "books.vertical")
                }

            CustomerPortalView(sessionStore: sessionStore, customerStore: customerStore)
                .tabItem {
                    Label("Customer", systemImage: "person.crop.circle")
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
            PersistedCustomerRequestRecord.self,
            PersistedValueDiscoveryProfile.self,
            KnowledgeVaultRecord.self
        ], inMemory: true)
}
