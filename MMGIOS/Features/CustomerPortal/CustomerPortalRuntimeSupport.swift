import Foundation
import SwiftData
import SwiftUI

struct CustomerPortalUser {
    var name: String
}

struct CustomerPortalSession {
    var user: CustomerPortalUser
}

@Observable
final class LocalSessionStore {
    var session = CustomerPortalSession(user: CustomerPortalUser(name: "MMG Customer"))
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

struct CustomerRequestSample {
    let subject: String
    let requestType: CustomerRequestType
    let status: CustomerRequestStatus
}

@Model
final class PersistedCustomerRequestRecord {
    var id: String
    var subject: String
    var requestTypeRawValue: String
    var statusRawValue: String
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        subject: String,
        requestType: CustomerRequestType,
        status: CustomerRequestStatus,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.subject = subject
        self.requestTypeRawValue = requestType.rawValue
        self.statusRawValue = status.rawValue
        self.updatedAt = updatedAt
    }

    convenience init(request: CustomerRequestSample) {
        self.init(
            subject: request.subject,
            requestType: request.requestType,
            status: request.status
        )
    }
}

enum SampleData {
    static let customerRequests: [CustomerRequestSample] = [
        CustomerRequestSample(
            subject: "Complete Value Discovery onboarding",
            requestType: .onboarding,
            status: .received
        ),
        CustomerRequestSample(
            subject: "Upload source files for production review",
            requestType: .assetSubmission,
            status: .inProgress
        )
    ]
}

struct CustomerRequestEditorView: View {
    let sessionStore: LocalSessionStore

    var body: some View {
        NavigationStack {
            List {
                Section("New Request") {
                    Text("Request intake for \(sessionStore.session.user.name) is ready for portal routing.")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New Request")
        }
    }
}

struct CustomerRequestDetailView: View {
    let request: PersistedCustomerRequestRecord

    var body: some View {
        List {
            Section("Request") {
                LabeledContent("Subject", value: request.subject)
                LabeledContent("Type", value: request.requestTypeRawValue)
                LabeledContent("Status", value: request.statusRawValue)
            }
        }
        .navigationTitle("Request Detail")
    }
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
