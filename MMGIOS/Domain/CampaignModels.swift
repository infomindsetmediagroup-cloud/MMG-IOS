import Foundation

enum CampaignStatus: String, CaseIterable, Codable, Identifiable {
    case draft = "Draft"
    case review = "Review"
    case approved = "Approved"
    case scheduled = "Scheduled"
    case live = "Live"
    case completed = "Completed"

    var id: String { rawValue }
}

enum CampaignChannel: String, CaseIterable, Codable, Identifiable {
    case email = "Email"
    case shopify = "Shopify"
    case social = "Social"
    case paidAds = "Paid Ads"
    case landingPage = "Landing Page"

    var id: String { rawValue }
}

enum AudienceSegment: String, CaseIterable, Codable, Identifiable {
    case newCreators = "New Creators"
    case authors = "Authors"
    case businessBuilders = "Business Builders"
    case customers = "Customers"
    case warmLeads = "Warm Leads"

    var id: String { rawValue }
}

struct PromoCode: Identifiable, Codable, Hashable {
    var id: UUID
    var code: String
    var discountDescription: String
    var usageLimit: Int?
    var startsAt: Date?
    var endsAt: Date?
    var isActive: Bool

    init(
        id: UUID = UUID(),
        code: String,
        discountDescription: String,
        usageLimit: Int? = nil,
        startsAt: Date? = nil,
        endsAt: Date? = nil,
        isActive: Bool = false
    ) {
        self.id = id
        self.code = code
        self.discountDescription = discountDescription
        self.usageLimit = usageLimit
        self.startsAt = startsAt
        self.endsAt = endsAt
        self.isActive = isActive
    }
}

struct Campaign: Identifiable, Codable, Hashable {
    var id: UUID
    var title: String
    var status: CampaignStatus
    var channel: CampaignChannel
    var audience: AudienceSegment
    var objective: String
    var offer: String
    var landingPagePath: String
    var promoCode: PromoCode?
    var requiresApproval: Bool
    var approvedBy: String?
    var scheduledAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        status: CampaignStatus = .draft,
        channel: CampaignChannel,
        audience: AudienceSegment,
        objective: String,
        offer: String,
        landingPagePath: String,
        promoCode: PromoCode? = nil,
        requiresApproval: Bool = true,
        approvedBy: String? = nil,
        scheduledAt: Date? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.status = status
        self.channel = channel
        self.audience = audience
        self.objective = objective
        self.offer = offer
        self.landingPagePath = landingPagePath
        self.promoCode = promoCode
        self.requiresApproval = requiresApproval
        self.approvedBy = approvedBy
        self.scheduledAt = scheduledAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var canLaunch: Bool {
        !requiresApproval || approvedBy != nil || status == .approved || status == .scheduled || status == .live || status == .completed
    }
}
