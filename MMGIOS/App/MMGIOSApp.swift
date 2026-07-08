import SwiftData
import SwiftUI

@main
struct MMGIOSApp: App {
    var body: some Scene {
        WindowGroup {
            AppRootView()
        }
        .modelContainer(for: [
            PersistedProjectRecord.self,
            PersistedCustomerRequestRecord.self,
            PersistedPublishingAssetRecord.self,
            PersistedReleasePackageRecord.self,
            PersistedCampaignRecord.self,
            PersistedReleaseChecklistRecord.self,
            PersistedIntelligenceItemRecord.self,
            PersistedValueDiscoveryProfile.self
        ])
    }
}
