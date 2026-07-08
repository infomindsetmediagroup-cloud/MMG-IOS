import Foundation

enum EnterpriseEventCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case customer
    case identity
    case commerce
    case publishing
    case workflow
    case project
    case ai
    case knowledge
    case notification
    case finance
    case analytics
    case security
    case governance
    case infrastructure
}

enum EventLifecycleStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case generated
    case validated
    case published
    case queued
    case consumed
    case acknowledged
    case archived
    case failed
}

enum EventDeliveryGuarantee: String, Codable, Hashable, Sendable, CaseIterable {
    case atLeastOnce
    case ordered
    case idempotent
}

enum EventReplayStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case requested
    case authorized
    case running
    case completed
    case failed
    case cancelled
}

enum DeadLetterResolutionStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case unresolved
    case retryScheduled
    case resolved
    case ignored
    case archived
}

struct DomainEvent: KairosDomainEntity {
    let id: UUID
    var version: Int
    var eventType: String
    var category: EnterpriseEventCategory
    var aggregateType: String
    var aggregateID: UUID
    var eventVersion: Int
    var correlationID: UUID
    var causationID: UUID?
    var initiatorID: UUID?
    var lifecycleStatus: EventLifecycleStatus
    var timestamp: Date
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct EventPayload: KairosDomainEntity {
    let id: UUID
    var version: Int
    var eventID: UUID
    var schemaVersion: String
    var serializedData: String
    var checksum: String
    var compressionType: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct EventSubscription: KairosDomainEntity {
    let id: UUID
    var version: Int
    var eventType: String
    var consumerID: UUID
    var status: EventLifecycleStatus
    var retryPolicy: String
    var deadLetterPolicy: String
    var deliveryGuarantee: EventDeliveryGuarantee
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct EventConsumer: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var domain: String
    var consumerVersion: String
    var status: EventLifecycleStatus
    var idempotencyKeyStrategy: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct EventQueue: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var category: EnterpriseEventCategory
    var priority: ProjectPriority
    var retentionPolicy: String
    var status: EventLifecycleStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct DeadLetterEvent: KairosDomainEntity {
    let id: UUID
    var version: Int
    var eventID: UUID
    var failureReason: String
    var retryCount: Int
    var lastAttemptAt: Date?
    var resolutionStatus: DeadLetterResolutionStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct EventReplay: KairosDomainEntity {
    let id: UUID
    var version: Int
    var startTime: Date
    var endTime: Date
    var scope: String
    var requestedBy: UUID
    var status: EventReplayStatus
    var replayedEventCount: Int
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct EventProcessingHistory: KairosDomainEntity {
    let id: UUID
    var version: Int
    var eventID: UUID
    var consumerID: UUID
    var queueID: UUID?
    var startedAt: Date
    var completedAt: Date?
    var outcome: WorkflowExecutionOutcome
    var errorDetails: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum EventFabricValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case invalidSchemaVersion
    case duplicateEventID
    case invalidConsumerRegistration
    case brokenSubscription
    case unauthorizedReplayRequest
    case payloadChecksumFailure
    case missingCorrelationIdentifier
}
