import Foundation

enum NotificationType: String, Codable, Hashable, Sendable, CaseIterable {
    case alert
    case reminder
    case approvalRequest
    case projectUpdate
    case billing
    case security
    case marketing
    case system
    case aiRecommendation
}

enum NotificationCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case security
    case billing
    case project
    case publishing
    case marketing
    case knowledge
    case ai
    case executive
    case system
    case customerSupport
}

enum NotificationPriority: String, Codable, Hashable, Sendable, CaseIterable {
    case critical
    case high
    case normal
    case low
    case silent
}

enum NotificationStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case created
    case queued
    case processing
    case delivered
    case read
    case archived
    case failed
}

enum DeliveryChannel: String, Codable, Hashable, Sendable, CaseIterable {
    case inApp
    case email
    case push
    case sms
    case web
    case dashboard
    case webhook
}

enum MessageType: String, Codable, Hashable, Sendable, CaseIterable {
    case customerSupport
    case projectDiscussion
    case internalTeam
    case aiConversationReference
    case executiveCommunication
    case approvalDiscussion
}

enum DeliveryAttemptStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case pending
    case sent
    case delivered
    case failed
    case suppressed
}

struct Notification: KairosDomainEntity {
    let id: UUID
    var version: Int
    var recipientID: UUID
    var type: NotificationType
    var category: NotificationCategory
    var priority: NotificationPriority
    var title: String
    var body: String
    var status: NotificationStatus
    var deliveryPolicy: String
    var scheduledAt: Date?
    var deliveredAt: Date?
    var readAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct NotificationTemplate: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var category: NotificationCategory
    var subject: String
    var bodyTemplate: String
    var deliveryChannels: Set<DeliveryChannel>
    var status: NotificationStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Conversation: KairosDomainEntity {
    let id: UUID
    var version: Int
    var participantIDs: [UUID]
    var relatedEntityType: String?
    var relatedEntityID: UUID?
    var messageType: MessageType
    var status: String
    var lastActivityAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Message: KairosDomainEntity {
    let id: UUID
    var version: Int
    var conversationID: UUID
    var senderID: UUID?
    var recipientID: UUID?
    var messageType: MessageType
    var content: String
    var attachmentAssetIDs: [UUID]
    var sentAt: Date?
    var editedAt: Date?
    var status: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Announcement: KairosDomainEntity {
    let id: UUID
    var version: Int
    var title: String
    var content: String
    var audience: String
    var publishDate: Date?
    var expirationDate: Date?
    var priority: NotificationPriority
    var status: NotificationStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct DeliveryAttempt: KairosDomainEntity {
    let id: UUID
    var version: Int
    var notificationID: UUID
    var channel: DeliveryChannel
    var status: DeliveryAttemptStatus
    var attemptedAt: Date
    var failureReason: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct NotificationPreference: KairosDomainEntity {
    let id: UUID
    var version: Int
    var userID: UUID
    var enabledChannels: Set<DeliveryChannel>
    var disabledCategories: Set<NotificationCategory>
    var quietHoursStart: String?
    var quietHoursEnd: String?
    var digestFrequency: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum CommunicationValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case missingRecipient
    case invalidChannel
    case expiredAnnouncement
    case duplicateScheduledNotification
    case invalidTemplateReference
    case unsupportedDeliveryPolicy
}
