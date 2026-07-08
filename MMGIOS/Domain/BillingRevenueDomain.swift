import Foundation

enum OrderStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case cart
    case checkout
    case authorized
    case paid
    case fulfilled
    case completed
    case cancelled
    case archived
}

enum InvoiceStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case draft
    case issued
    case partiallyPaid
    case paid
    case cancelled
    case archived
}

enum PaymentProvider: String, Codable, Hashable, Sendable, CaseIterable {
    case manual
    case shopify
    case stripe
    case apple
    case futureProvider
}

enum PaymentLifecycleStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case initiated
    case authorized
    case captured
    case settled
    case failed
    case refunded
}

enum RefundStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case requested
    case approved
    case processed
    case rejected
    case cancelled
}

enum RevenueCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case digitalProducts
    case publishingServices
    case subscriptions
    case consulting
    case enterpriseServices
    case royalties
    case otherRevenue
}

enum SalesChannel: String, Codable, Hashable, Sendable, CaseIterable {
    case mmgWebsite
    case shopify
    case manualInvoice
    case amazonKDPManualImport
    case futureEnterpriseChannel
}

enum TransactionType: String, Codable, Hashable, Sendable, CaseIterable {
    case order
    case invoice
    case payment
    case refund
    case adjustment
    case royaltyImport
    case tax
}

struct Order: KairosDomainEntity {
    let id: UUID
    var version: Int
    var orderNumber: String
    var customerID: UUID
    var status: OrderStatus
    var currencyCode: String
    var orderTotal: Decimal
    var taxTotal: Decimal
    var discountTotal: Decimal
    var grandTotal: Decimal
    var salesChannel: SalesChannel
    var completedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct OrderItem: KairosDomainEntity {
    let id: UUID
    var version: Int
    var orderID: UUID
    var productID: UUID
    var quantity: Int
    var unitPrice: Decimal
    var discountAmount: Decimal
    var taxAmount: Decimal
    var lineTotal: Decimal
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Invoice: KairosDomainEntity {
    let id: UUID
    var version: Int
    var invoiceNumber: String
    var customerID: UUID
    var orderID: UUID?
    var status: InvoiceStatus
    var issueDate: Date
    var dueDate: Date?
    var currencyCode: String
    var balanceDue: Decimal
    var totalAmount: Decimal
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Payment: KairosDomainEntity {
    let id: UUID
    var version: Int
    var invoiceID: UUID?
    var customerID: UUID
    var paymentMethod: String
    var provider: PaymentProvider
    var providerReference: String?
    var amount: Decimal
    var currencyCode: String
    var status: PaymentLifecycleStatus
    var processedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Refund: KairosDomainEntity {
    let id: UUID
    var version: Int
    var paymentID: UUID
    var reason: String
    var amount: Decimal
    var status: RefundStatus
    var approvedBy: UUID?
    var processedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct SubscriptionBillingEvent: KairosDomainEntity {
    let id: UUID
    var version: Int
    var subscriptionID: UUID
    var billingCycle: BillingCycle
    var renewalDate: Date?
    var invoiceID: UUID?
    var status: PaymentStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Discount: KairosDomainEntity {
    let id: UUID
    var version: Int
    var code: String
    var discountType: String
    var value: Decimal
    var eligibilityRules: [String]
    var startDate: Date?
    var endDate: Date?
    var usageLimit: Int?
    var status: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct RoyaltyImport: KairosDomainEntity {
    let id: UUID
    var version: Int
    var source: SalesChannel
    var reportingPeriod: String
    var importedAt: Date
    var grossRevenue: Decimal
    var netRevenue: Decimal
    var unitsSold: Int
    var notes: String?
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct FinancialTransaction: KairosDomainEntity {
    let id: UUID
    var version: Int
    var transactionType: TransactionType
    var relatedEntityType: String
    var relatedEntityID: UUID
    var amount: Decimal
    var currencyCode: String
    var postedAt: Date
    var ledgerStatus: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct TaxRecord: KairosDomainEntity {
    let id: UUID
    var version: Int
    var relatedEntityType: String
    var relatedEntityID: UUID
    var jurisdiction: String
    var taxRate: Decimal
    var taxableAmount: Decimal
    var taxAmount: Decimal
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum BillingValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case invalidOrderTotals
    case duplicatePaymentReference
    case expiredDiscount
    case invalidTaxCalculation
    case duplicateInvoiceNumber
    case invalidRefundAmount
    case duplicateRoyaltyImport
    case currencyMismatch
}
