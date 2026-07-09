import SwiftData
import SwiftUI

@main
struct MMGIOSApp: App {
    var body: some Scene {
        WindowGroup {
            AppRootView()
        }
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
        ])
    }
}
