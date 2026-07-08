import Foundation

enum MetricCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case revenue
    case customer
    case subscription
    case publishing
    case workflow
    case ai
    case knowledge
    case marketing
    case operations
    case finance
    case platform
    case security
    case infrastructure
}

enum AggregationMethod: String, Codable, Hashable, Sendable, CaseIterable {
    case count
    case sum
    case average
    case median
    case minimum
    case maximum
    case percentile
    case ratio
    case rollingWindow
    case timeSeries
}

enum KPIStatus: String, Codable, Hashable, Sendable, CaseIterable {
    case healthy
    case watch
    case warning
    case critical
    case archived
}

enum TrendDirection: String, Codable, Hashable, Sendable, CaseIterable {
    case up
    case down
    case flat
    case volatile
    case unknown
}

enum DashboardAudience: String, Codable, Hashable, Sendable, CaseIterable {
    case executive
    case administration
    case customerSuccess
    case publishing
    case marketing
    case finance
    case aiOperations
    case platformHealth
    case workflowOperations
    case security
}

enum WidgetType: String, Codable, Hashable, Sendable, CaseIterable {
    case kpiCard
    case chart
    case table
    case timeline
    case activityFeed
    case alertList
    case recommendationList
    case forecast
}

enum ForecastType: String, Codable, Hashable, Sendable, CaseIterable {
    case trendProjection
    case capacity
    case revenue
    case subscription
    case resourceUtilization
    case publishingDemand
    case aiWorkload
}

enum InsightSeverity: String, Codable, Hashable, Sendable, CaseIterable {
    case informational
    case opportunity
    case warning
    case critical
}

struct Metric: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var description: String
    var category: MetricCategory
    var unit: String
    var aggregationMethod: AggregationMethod
    var ownerDepartment: String
    var refreshFrequency: String
    var status: KPIStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct KPI: KairosDomainEntity {
    let id: UUID
    var version: Int
    var metricID: UUID
    var targetValue: Decimal
    var warningThreshold: Decimal?
    var criticalThreshold: Decimal?
    var currentValue: Decimal?
    var trend: TrendDirection
    var score: Double?
    var status: KPIStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct AnalyticsDashboard: KairosDomainEntity {
    let id: UUID
    var version: Int
    var name: String
    var audience: DashboardAudience
    var description: String
    var layoutVersion: String
    var visibility: Visibility
    var status: KPIStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct AnalyticsDashboardWidget: KairosDomainEntity {
    let id: UUID
    var version: Int
    var dashboardID: UUID
    var widgetType: WidgetType
    var dataSource: String
    var position: Int
    var size: String
    var configuration: [String: String]
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct AnalyticsReport: KairosDomainEntity {
    let id: UUID
    var version: Int
    var title: String
    var reportType: String
    var generatedAt: Date?
    var generatedBy: UUID?
    var scope: String
    var status: KPIStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Forecast: KairosDomainEntity {
    let id: UUID
    var version: Int
    var metricID: UUID
    var forecastType: ForecastType
    var predictionWindow: String
    var generatedAt: Date?
    var confidence: Double
    var assumptions: [String]
    var status: KPIStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct Insight: KairosDomainEntity {
    let id: UUID
    var version: Int
    var category: MetricCategory
    var severity: InsightSeverity
    var summary: String
    var supportingMetricIDs: [UUID]
    var recommendation: String?
    var generatedAt: Date?
    var status: KPIStatus
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

struct MetricHistory: KairosDomainEntity {
    let id: UUID
    var version: Int
    var metricID: UUID
    var value: Decimal
    var recordedAt: Date
    var source: String
    var createdAt: Date
    var updatedAt: Date
    var trustLayerReference: UUID?
}

enum AnalyticsValidationFailure: String, Codable, Hashable, Sendable, CaseIterable {
    case invalidKPIThresholds
    case duplicateMetric
    case brokenWidgetReference
    case invalidForecastAssumptions
    case missingAggregationSource
    case unauthorizedDashboardAccess
    case reportGenerationFailure
}
