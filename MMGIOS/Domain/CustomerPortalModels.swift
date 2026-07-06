import Foundation

enum CustomerRequestType: String, CaseIterable, Codable, Identifiable {
    case onboarding = "Onboarding"
    case manuscript = "Manuscript"
    case serviceBuild = "Service Build"
    case revision = "Revision"
    case support = "Support"

    var id: String { rawValue }
}

enum CustomerRequestStatus: String, CaseIterable, Codable, Identifiable {
    case received = "Received"
    case needsReview = "Needs Review"
    case inProduction = "In Production"
    case waitingOnCustomer = "Waiting on Customer"
    case complete = "Complete"

    var id: String { rawValue }
}

struct CustomerPortalRequest: Identifiable, Codable, Hashable {
    var id: UUID
    var customerName: String
    var email: String
    var requestType: CustomerRequestType
    var status: CustomerRequestStatus
    var subject: String
    var message: String
    var createdAt: Date

    init(
        id: UUID = UUID(),
        customerName: String,
        email: String,
        requestType: CustomerRequestType,
        status: CustomerRequestStatus = .received,
        subject: String,
        message: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.customerName = customerName
        self.email = email
        self.requestType = requestType
        self.status = status
        self.subject = subject
        self.message = message
        self.createdAt = createdAt
    }
}
