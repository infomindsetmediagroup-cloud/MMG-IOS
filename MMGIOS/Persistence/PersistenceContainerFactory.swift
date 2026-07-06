import Foundation
import SwiftData

enum PersistenceContainerFactory {
    static let schema = Schema([
        PersistedProjectRecord.self,
        PersistedCustomerRequestRecord.self,
        PersistedPublishingAssetRecord.self,
        PersistedReleasePackageRecord.self,
        PersistedCampaignRecord.self,
        PersistedReleaseChecklistRecord.self
    ])

    static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let configuration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: inMemory
        )

        return try ModelContainer(
            for: schema,
            configurations: [configuration]
        )
    }
}
