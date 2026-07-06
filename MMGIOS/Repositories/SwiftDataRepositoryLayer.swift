import Foundation
import SwiftData

/// Canonical repository layer for Kairos SwiftData persistence.
///
/// This layer gives command-center views and future service objects a stable data-access
/// boundary instead of reaching directly into feature-specific local stores or raw
/// `ModelContext` operations for each workflow.
@MainActor
protocol RepositoryEntity: PersistentModel, Identifiable where ID == UUID {
    var updatedAt: Date { get set }
}

@MainActor
protocol Repository {
    associatedtype Entity: RepositoryEntity

    func fetchAll(sortBy sortDescriptors: [SortDescriptor<Entity>]) throws -> [Entity]
    func find(id: UUID) throws -> Entity?
    func insert(_ entity: Entity) throws
    func delete(_ entity: Entity) throws
    func delete(id: UUID) throws
    func save() throws
}

@MainActor
final class SwiftDataRepository<Entity: RepositoryEntity>: Repository {
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func fetchAll(sortBy sortDescriptors: [SortDescriptor<Entity>] = []) throws -> [Entity] {
        let descriptor = FetchDescriptor<Entity>(sortBy: sortDescriptors)
        return try modelContext.fetch(descriptor)
    }

    func find(id: UUID) throws -> Entity? {
        try fetchAll().first { $0.id == id }
    }

    func insert(_ entity: Entity) throws {
        entity.updatedAt = Date()
        modelContext.insert(entity)
        try save()
    }

    func delete(_ entity: Entity) throws {
        modelContext.delete(entity)
        try save()
    }

    func delete(id: UUID) throws {
        guard let entity = try find(id: id) else { return }
        try delete(entity)
    }

    func save() throws {
        try modelContext.save()
    }
}

// MARK: - Canonical entity conformance

extension PersistedProjectRecord: RepositoryEntity {}
extension PersistedCustomerRequestRecord: RepositoryEntity {}
extension PersistedPublishingAssetRecord: RepositoryEntity {}
extension PersistedReleasePackageRecord: RepositoryEntity {}
extension PersistedCampaignRecord: RepositoryEntity {}
extension PersistedReleaseChecklistRecord: RepositoryEntity {}
extension PersistedIntelligenceItemRecord: RepositoryEntity {}

// MARK: - Domain-specific repository interfaces

@MainActor
protocol ProjectRepository {
    func fetchProjects() throws -> [PersistedProjectRecord]
    func findProject(id: UUID) throws -> PersistedProjectRecord?
    func saveProject(_ project: PersistedProjectRecord) throws
    func deleteProject(id: UUID) throws
}

@MainActor
protocol CustomerRepository {
    func fetchCustomerRequests() throws -> [PersistedCustomerRequestRecord]
    func findCustomerRequest(id: UUID) throws -> PersistedCustomerRequestRecord?
    func saveCustomerRequest(_ request: PersistedCustomerRequestRecord) throws
    func deleteCustomerRequest(id: UUID) throws
}

@MainActor
protocol PublishingRepository {
    func fetchPublishingAssets() throws -> [PersistedPublishingAssetRecord]
    func findPublishingAsset(id: UUID) throws -> PersistedPublishingAssetRecord?
    func savePublishingAsset(_ asset: PersistedPublishingAssetRecord) throws
    func deletePublishingAsset(id: UUID) throws
}

@MainActor
protocol ProductionRepository {
    func fetchProductionProjects() throws -> [PersistedProjectRecord]
    func saveProductionProject(_ project: PersistedProjectRecord) throws
}

@MainActor
protocol QualityRepository {
    func fetchReleaseChecklists() throws -> [PersistedReleaseChecklistRecord]
    func findReleaseChecklist(id: UUID) throws -> PersistedReleaseChecklistRecord?
    func saveReleaseChecklist(_ checklist: PersistedReleaseChecklistRecord) throws
    func deleteReleaseChecklist(id: UUID) throws
}

@MainActor
protocol ReleaseRepository {
    func fetchReleasePackages() throws -> [PersistedReleasePackageRecord]
    func findReleasePackage(id: UUID) throws -> PersistedReleasePackageRecord?
    func saveReleasePackage(_ package: PersistedReleasePackageRecord) throws
    func deleteReleasePackage(id: UUID) throws
}

@MainActor
protocol MarketingRepository {
    func fetchCampaigns() throws -> [PersistedCampaignRecord]
    func findCampaign(id: UUID) throws -> PersistedCampaignRecord?
    func saveCampaign(_ campaign: PersistedCampaignRecord) throws
    func deleteCampaign(id: UUID) throws
}

@MainActor
protocol NotificationRepository {
    func fetchIntelligenceItems() throws -> [PersistedIntelligenceItemRecord]
    func findIntelligenceItem(id: UUID) throws -> PersistedIntelligenceItemRecord?
    func saveIntelligenceItem(_ item: PersistedIntelligenceItemRecord) throws
    func deleteIntelligenceItem(id: UUID) throws
}

// MARK: - Concrete repository hub

@MainActor
final class KairosSwiftDataRepositoryHub: ProjectRepository,
                                         CustomerRepository,
                                         PublishingRepository,
                                         ProductionRepository,
                                         QualityRepository,
                                         ReleaseRepository,
                                         MarketingRepository,
                                         NotificationRepository {
    private let projects: SwiftDataRepository<PersistedProjectRecord>
    private let customerRequests: SwiftDataRepository<PersistedCustomerRequestRecord>
    private let publishingAssets: SwiftDataRepository<PersistedPublishingAssetRecord>
    private let releasePackages: SwiftDataRepository<PersistedReleasePackageRecord>
    private let campaigns: SwiftDataRepository<PersistedCampaignRecord>
    private let releaseChecklists: SwiftDataRepository<PersistedReleaseChecklistRecord>
    private let intelligenceItems: SwiftDataRepository<PersistedIntelligenceItemRecord>

    init(modelContext: ModelContext) {
        self.projects = SwiftDataRepository(modelContext: modelContext)
        self.customerRequests = SwiftDataRepository(modelContext: modelContext)
        self.publishingAssets = SwiftDataRepository(modelContext: modelContext)
        self.releasePackages = SwiftDataRepository(modelContext: modelContext)
        self.campaigns = SwiftDataRepository(modelContext: modelContext)
        self.releaseChecklists = SwiftDataRepository(modelContext: modelContext)
        self.intelligenceItems = SwiftDataRepository(modelContext: modelContext)
    }

    func fetchProjects() throws -> [PersistedProjectRecord] {
        try projects.fetchAll(sortBy: [SortDescriptor(\PersistedProjectRecord.updatedAt, order: .reverse)])
    }

    func findProject(id: UUID) throws -> PersistedProjectRecord? {
        try projects.find(id: id)
    }

    func saveProject(_ project: PersistedProjectRecord) throws {
        try projects.insert(project)
    }

    func deleteProject(id: UUID) throws {
        try projects.delete(id: id)
    }

    func fetchCustomerRequests() throws -> [PersistedCustomerRequestRecord] {
        try customerRequests.fetchAll(sortBy: [SortDescriptor(\PersistedCustomerRequestRecord.updatedAt, order: .reverse)])
    }

    func findCustomerRequest(id: UUID) throws -> PersistedCustomerRequestRecord? {
        try customerRequests.find(id: id)
    }

    func saveCustomerRequest(_ request: PersistedCustomerRequestRecord) throws {
        try customerRequests.insert(request)
    }

    func deleteCustomerRequest(id: UUID) throws {
        try customerRequests.delete(id: id)
    }

    func fetchPublishingAssets() throws -> [PersistedPublishingAssetRecord] {
        try publishingAssets.fetchAll(sortBy: [SortDescriptor(\PersistedPublishingAssetRecord.updatedAt, order: .reverse)])
    }

    func findPublishingAsset(id: UUID) throws -> PersistedPublishingAssetRecord? {
        try publishingAssets.find(id: id)
    }

    func savePublishingAsset(_ asset: PersistedPublishingAssetRecord) throws {
        try publishingAssets.insert(asset)
    }

    func deletePublishingAsset(id: UUID) throws {
        try publishingAssets.delete(id: id)
    }

    func fetchProductionProjects() throws -> [PersistedProjectRecord] {
        try fetchProjects().filter { $0.areaRawValue == WorkflowArea.production.rawValue }
    }

    func saveProductionProject(_ project: PersistedProjectRecord) throws {
        try saveProject(project)
    }

    func fetchReleaseChecklists() throws -> [PersistedReleaseChecklistRecord] {
        try releaseChecklists.fetchAll(sortBy: [SortDescriptor(\PersistedReleaseChecklistRecord.updatedAt, order: .reverse)])
    }

    func findReleaseChecklist(id: UUID) throws -> PersistedReleaseChecklistRecord? {
        try releaseChecklists.find(id: id)
    }

    func saveReleaseChecklist(_ checklist: PersistedReleaseChecklistRecord) throws {
        try releaseChecklists.insert(checklist)
    }

    func deleteReleaseChecklist(id: UUID) throws {
        try releaseChecklists.delete(id: id)
    }

    func fetchReleasePackages() throws -> [PersistedReleasePackageRecord] {
        try releasePackages.fetchAll(sortBy: [SortDescriptor(\PersistedReleasePackageRecord.updatedAt, order: .reverse)])
    }

    func findReleasePackage(id: UUID) throws -> PersistedReleasePackageRecord? {
        try releasePackages.find(id: id)
    }

    func saveReleasePackage(_ package: PersistedReleasePackageRecord) throws {
        try releasePackages.insert(package)
    }

    func deleteReleasePackage(id: UUID) throws {
        try releasePackages.delete(id: id)
    }

    func fetchCampaigns() throws -> [PersistedCampaignRecord] {
        try campaigns.fetchAll(sortBy: [SortDescriptor(\PersistedCampaignRecord.updatedAt, order: .reverse)])
    }

    func findCampaign(id: UUID) throws -> PersistedCampaignRecord? {
        try campaigns.find(id: id)
    }

    func saveCampaign(_ campaign: PersistedCampaignRecord) throws {
        try campaigns.insert(campaign)
    }

    func deleteCampaign(id: UUID) throws {
        try campaigns.delete(id: id)
    }

    func fetchIntelligenceItems() throws -> [PersistedIntelligenceItemRecord] {
        try intelligenceItems.fetchAll(sortBy: [SortDescriptor(\PersistedIntelligenceItemRecord.updatedAt, order: .reverse)])
    }

    func findIntelligenceItem(id: UUID) throws -> PersistedIntelligenceItemRecord? {
        try intelligenceItems.find(id: id)
    }

    func saveIntelligenceItem(_ item: PersistedIntelligenceItemRecord) throws {
        try intelligenceItems.insert(item)
    }

    func deleteIntelligenceItem(id: UUID) throws {
        try intelligenceItems.delete(id: id)
    }
}
