import SwiftData
import SwiftUI

@main
struct MMGIOSApp: App {
    var body: some Scene {
        WindowGroup {
            AppRootView()
        }
        .modelContainer(for: [
            PersistedCustomerRequestRecord.self,
            PersistedValueDiscoveryProfile.self,
            CustomerReleaseRecord.self,
            DeliverableRecord.self,
            ProductionAssetRecord.self
        ])
    }
}
