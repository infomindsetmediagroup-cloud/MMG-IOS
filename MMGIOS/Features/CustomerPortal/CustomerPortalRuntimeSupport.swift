import Foundation
import SwiftData
import SwiftUI

struct CustomerPortalUser {
    var name: String
    var email: String
}

struct CustomerPortalSession {
    var user: CustomerPortalUser
}

@Observable
final class LocalSessionStore {
    var session = CustomerPortalSession(
        user: CustomerPortalUser(
            name: "MMG Customer",
            email: "customer@mindsetmediagroup.com"
        )
    )
}

@Observable
final class LocalCustomerPortalStore {}

enum CustomerRequestStatus: String, CaseIterable, Identifiable {
    case received = "Received"
    case inProgress = "In Progress"
    case waitingForCustomer = "Waiting for Customer"
    case complete = "Complete"

    var id: String { rawValue }
}

enum CustomerRequestType: String, CaseIterable, Identifiable {
    case onboarding = "Onboarding"
    case assetSubmission = "Asset Submission"
    case support = "Support"
    case projectHandoff = "Project Handoff"

    var id: String { rawValue }
}

struct CustomerPortalRequest {
    let customerName: String
    let email: String
    let requestType: CustomerRequestType
    let subject: String
    let message: String
}

struct CustomerRequestSample {
    let customerName: String
    let email: String
    let subject: String
    let message: String
    let requestType: CustomerRequestType
    let status: CustomerRequestStatus
}

@Model
final class PersistedCustomerRequestRecord {
    var id: String
    var customerName: String
    var email: String
    var subject: String
    var message: String
    var requestTypeRawValue: String
    var statusRawValue: String
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        customerName: String,
        email: String,
        subject: String,
        message: String,
        requestType: CustomerRequestType,
        status: CustomerRequestStatus,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.customerName = customerName
        self.email = email
        self.subject = subject
        self.message = message
        self.requestTypeRawValue = requestType.rawValue
        self.statusRawValue = status.rawValue
        self.updatedAt = updatedAt
    }

    convenience init(request: CustomerRequestSample) {
        self.init(
            customerName: request.customerName,
            email: request.email,
            subject: request.subject,
            message: request.message,
            requestType: request.requestType,
            status: request.status
        )
    }

    convenience init(request: CustomerPortalRequest) {
        self.init(
            customerName: request.customerName,
            email: request.email,
            subject: request.subject,
            message: request.message,
            requestType: request.requestType,
            status: .received
        )
    }
}

enum SampleData {
    static let customerRequests: [CustomerRequestSample] = [
        CustomerRequestSample(
            customerName: "MMG Customer",
            email: "customer@mindsetmediagroup.com",
            subject: "Complete Value Discovery onboarding",
            message: "Customer is ready to complete the guided Value Discovery profile and convert knowledge assets into a production path.",
            requestType: .onboarding,
            status: .received
        ),
        CustomerRequestSample(
            customerName: "MMG Customer",
            email: "customer@mindsetmediagroup.com",
            subject: "Upload source files for production review",
            message: "Customer needs controlled intake for source files before production review and deliverable preparation.",
            requestType: .assetSubmission,
            status: .inProgress
        )
    ]
}

struct SectionHeader: View {
    let eyebrow: String
    let title: String
    let bodyText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(title)
                .font(.title2.bold())
            Text(bodyText)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }
}
