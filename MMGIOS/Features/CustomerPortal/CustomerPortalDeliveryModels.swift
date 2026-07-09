import Foundation
import SwiftData

enum CustomerPortalNotificationKind: String, CaseIterable, Identifiable {
    case releasePublished = "Release Published"
    case releaseUpdated = "Release Updated"
    case releaseSuperseded = "Release Superseded"

    var id: String { rawValue }
}

enum CustomerPortalNotificationStatus: String, CaseIterable, Identifiable {
    case unread = "Unread"
    case read = "Read"

    var id: String { rawValue }
}

@Model
final class CustomerPortalNotificationRecord {
    var id: String
    var releaseID: String
    var projectID: String
    var title: String
    var message: String
    var kind: String
    var status: String
    var createdAt: Date
    var readAt: Date?

    init(
        id: String = UUID().uuidString,
        releaseID: String,
        projectID: String,
        title: String,
        message: String,
        kind: CustomerPortalNotificationKind = .releasePublished,
        status: CustomerPortalNotificationStatus = .unread,
        createdAt: Date = .now,
        readAt: Date? = nil
    ) {
        self.id = id
        self.releaseID = releaseID
        self.projectID = projectID
        self.title = title
        self.message = message
        self.kind = kind.rawValue
        self.status = status.rawValue
        self.createdAt = createdAt
        self.readAt = readAt
    }
}

struct CustomerDeliverableProjectGroup: Identifiable {
    let projectID: String
    let releases: [CustomerReleaseRecord]

    var id: String { projectID }
    var latestRelease: CustomerReleaseRecord? { releases.sorted { $0.version > $1.version }.first }
}

struct CustomerReleaseTimelineEvent: Identifiable {
    let id: String
    let releaseID: String
    let projectID: String
    let title: String
    let event: String
    let detail: String
    let occurredAt: Date
}

struct CustomerDeliveryPackage: Identifiable {
    let id: String
    let releaseID: String
    let projectID: String
    let title: String
    let versionLabel: String
    let releaseNotes: String
    let approvalSummary: String
    let controlledAccessLocation: String
    let publishedAt: Date?
}

struct SecureAssetAccessPolicy {
    func isCustomerVisible(_ release: CustomerReleaseRecord) -> Bool {
        release.status == CustomerReleaseStatus.published.rawValue
            && release.releaseLocation.hasPrefix("portal-secure://")
            && !release.approvedBy.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && release.publishedAt != nil
    }

    func customerFacingLocation(for release: CustomerReleaseRecord) -> String {
        if release.releaseLocation.hasPrefix("portal-secure://") {
            return release.releaseLocation
        }

        return "portal-secure://projects/\(release.projectID)/deliverables/\(release.deliverableID)/v\(release.version)"
    }
}

struct CustomerDeliverablesLibraryBuilder {
    private let accessPolicy = SecureAssetAccessPolicy()

    func visiblePublishedReleases(from releases: [CustomerReleaseRecord]) -> [CustomerReleaseRecord] {
        releases
            .filter { accessPolicy.isCustomerVisible($0) }
            .sorted { lhs, rhs in
                if lhs.projectID == rhs.projectID { return lhs.version > rhs.version }
                return lhs.updatedAt > rhs.updatedAt
            }
    }

    func projectGroups(from releases: [CustomerReleaseRecord]) -> [CustomerDeliverableProjectGroup] {
        let visible = visiblePublishedReleases(from: releases)
        return Dictionary(grouping: visible, by: \CustomerReleaseRecord.projectID)
            .map { CustomerDeliverableProjectGroup(projectID: $0.key, releases: $0.value.sorted { $0.version > $1.version }) }
            .sorted { ($0.latestRelease?.updatedAt ?? .distantPast) > ($1.latestRelease?.updatedAt ?? .distantPast) }
    }

    func timeline(from releases: [CustomerReleaseRecord]) -> [CustomerReleaseTimelineEvent] {
        releases.flatMap { release -> [CustomerReleaseTimelineEvent] in
            var events: [CustomerReleaseTimelineEvent] = []

            if let approvedAt = release.approvedAt {
                events.append(CustomerReleaseTimelineEvent(
                    id: "\(release.id)-approved",
                    releaseID: release.id,
                    projectID: release.projectID,
                    title: release.title,
                    event: "Approved",
                    detail: release.approvalNotes.isEmpty ? "Release cleared for customer delivery." : release.approvalNotes,
                    occurredAt: approvedAt
                ))
            }

            if let publishedAt = release.publishedAt {
                events.append(CustomerReleaseTimelineEvent(
                    id: "\(release.id)-published",
                    releaseID: release.id,
                    projectID: release.projectID,
                    title: release.title,
                    event: "Published",
                    detail: "Final deliverable made visible in the Customer Portal.",
                    occurredAt: publishedAt
                ))
            }

            if let archivedAt = release.archivedAt {
                events.append(CustomerReleaseTimelineEvent(
                    id: "\(release.id)-superseded",
                    releaseID: release.id,
                    projectID: release.projectID,
                    title: release.title,
                    event: "Superseded",
                    detail: "Release retained in history while newer delivery versions remain active.",
                    occurredAt: archivedAt
                ))
            }

            events.append(CustomerReleaseTimelineEvent(
                id: "\(release.id)-updated",
                releaseID: release.id,
                projectID: release.projectID,
                title: release.title,
                event: "Updated",
                detail: "Release metadata updated in the delivery audit trail.",
                occurredAt: release.updatedAt
            ))

            return events
        }
        .sorted { $0.occurredAt > $1.occurredAt }
    }

    func package(for release: CustomerReleaseRecord) -> CustomerDeliveryPackage {
        CustomerDeliveryPackage(
            id: "package-\(release.id)",
            releaseID: release.id,
            projectID: release.projectID,
            title: release.title,
            versionLabel: "v\(release.version)",
            releaseNotes: release.summary,
            approvalSummary: release.approvedBy.isEmpty ? "Approval metadata pending." : "Approved by \(release.approvedBy). \(release.approvalNotes)",
            controlledAccessLocation: accessPolicy.customerFacingLocation(for: release),
            publishedAt: release.publishedAt
        )
    }

    func unreadNotifications(from notifications: [CustomerPortalNotificationRecord]) -> [CustomerPortalNotificationRecord] {
        notifications
            .filter { $0.status == CustomerPortalNotificationStatus.unread.rawValue }
            .sorted { $0.createdAt > $1.createdAt }
    }

    func hasPublicationNotification(for release: CustomerReleaseRecord, in notifications: [CustomerPortalNotificationRecord]) -> Bool {
        notifications.contains {
            $0.releaseID == release.id && $0.kind == CustomerPortalNotificationKind.releasePublished.rawValue
        }
    }

    func makePublicationNotification(for release: CustomerReleaseRecord) -> CustomerPortalNotificationRecord {
        CustomerPortalNotificationRecord(
            releaseID: release.id,
            projectID: release.projectID,
            title: "New deliverable published",
            message: "\(release.title) v\(release.version) is ready in your controlled Customer Portal deliverables library.",
            kind: .releasePublished,
            status: .unread,
            createdAt: release.publishedAt ?? .now
        )
    }

    func markRead(_ notification: CustomerPortalNotificationRecord) {
        notification.status = CustomerPortalNotificationStatus.read.rawValue
        notification.readAt = .now
    }
}
