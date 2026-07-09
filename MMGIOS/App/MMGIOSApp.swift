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
            PersistedDesignStudioProject.self,
            PersistedDesignStudioAsset.self,
            PersistedDesignStudioVersionRecord.self,
            PersistedDesignStudioExportJob.self,
            PersistedDesignStudioPermissionRecord.self,
            PersistedDesignStudioAuditEvent.self
        ])
    }
}
