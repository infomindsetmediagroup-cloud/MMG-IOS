import Foundation
import SwiftData

@Model
final class PersistedProjectRecord {
    @Attribute(.unique) var id: UUID
    var title: String
    var clientName: String
    var areaRawValue: String
    var statusRawValue: String
    var priorityRawValue: String
    var summary: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        clientName: String,
        areaRawValue: String,
        statusRawValue: String,
        priorityRawValue: String,
        summary: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.clientName = clientName
        self.areaRawValue = areaRawValue
        self.statusRawValue = statusRawValue
        self.priorityRawValue = priorityRawValue
        self.summary = summary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

@Model
final class PersistedCustomerRequestRecord {
    @Attribute(.unique) var id: UUID
    var customerName: String
    var email: String
    var requestTypeRawValue: String
    var statusRawValue: String
    var subject: String
    var message: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        customerName: String,
        email: String,
        requestTypeRawValue: String,
        statusRawValue: String,
        subject: String,
        message: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.customerName = customerName
        self.email = email
        self.requestTypeRawValue = requestTypeRawValue
        self.statusRawValue = statusRawValue
        self.subject = subject
        self.message = message
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

@Model
final class PersistedPublishingAssetRecord {
    @Attribute(.unique) var id: UUID
    var title: String
    var assetTypeRawValue: String
    var statusRawValue: String
    var owner: String
    var canonicalPath: String
    var summary: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        assetTypeRawValue: String,
        statusRawValue: String,
        owner: String,
        canonicalPath: String,
        summary: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.assetTypeRawValue = assetTypeRawValue
        self.statusRawValue = statusRawValue
        self.owner = owner
        self.canonicalPath = canonicalPath
        self.summary = summary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

@Model
final class PersistedReleasePackageRecord {
    @Attribute(.unique) var id: UUID
    var title: String
    var statusRawValue: String
    var summary: String
    var customerImpact: String
    var internalNotes: String
    var validationSummary: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        statusRawValue: String,
        summary: String,
        customerImpact: String,
        internalNotes: String,
        validationSummary: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.statusRawValue = statusRawValue
        self.summary = summary
        self.customerImpact = customerImpact
        self.internalNotes = internalNotes
        self.validationSummary = validationSummary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

@Model
final class PersistedCampaignRecord {
    @Attribute(.unique) var id: UUID
    var title: String
    var statusRawValue: String
    var channelRawValue: String
    var audienceRawValue: String
    var objective: String
    var offer: String
    var landingPagePath: String
    var requiresApproval: Bool
    var approvedBy: String?
    var scheduledAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        statusRawValue: String,
        channelRawValue: String,
        audienceRawValue: String,
        objective: String,
        offer: String,
        landingPagePath: String,
        requiresApproval: Bool,
        approvedBy: String? = nil,
        scheduledAt: Date? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.statusRawValue = statusRawValue
        self.channelRawValue = channelRawValue
        self.audienceRawValue = audienceRawValue
        self.objective = objective
        self.offer = offer
        self.landingPagePath = landingPagePath
        self.requiresApproval = requiresApproval
        self.approvedBy = approvedBy
        self.scheduledAt = scheduledAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
