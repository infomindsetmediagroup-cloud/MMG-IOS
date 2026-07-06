import Foundation

// MARK: - Publishing Service Expansion

public enum PublishingServiceTier: String, Codable, CaseIterable, Identifiable {
    case digitalOnly
    case digitalPlusPaperback
    case digitalPlusPaperbackAndHardcover

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .digitalOnly: return "Digital Publication"
        case .digitalPlusPaperback: return "Digital + Paperback"
        case .digitalPlusPaperbackAndHardcover: return "Digital + Paperback + Hardcover"
        }
    }
}

public enum PublishingServiceActivationState: String, Codable, CaseIterable, Identifiable {
    case available
    case gatedByValidation
    case reserved
    case disabled

    public var id: String { rawValue }
}

public struct PublishingServiceUpgradeOption: Identifiable, Codable, Hashable {
    public let id: UUID
    public var tier: PublishingServiceTier
    public var state: PublishingServiceActivationState
    public var includedFormats: [PublishingFormat]
    public var requirements: [String]
    public var summary: String

    public init(
        id: UUID = UUID(),
        tier: PublishingServiceTier,
        state: PublishingServiceActivationState,
        includedFormats: [PublishingFormat],
        requirements: [String],
        summary: String
    ) {
        self.id = id
        self.tier = tier
        self.state = state
        self.includedFormats = includedFormats
        self.requirements = requirements
        self.summary = summary
    }
}

public enum PublishingServiceUpgradeCatalog {
    public static let options: [PublishingServiceUpgradeOption] = [
        PublishingServiceUpgradeOption(
            tier: .digitalOnly,
            state: .available,
            includedFormats: [.digital],
            requirements: ["Approved manuscript", "Approved cover", "Metadata complete"],
            summary: "Digital publication package for ebook, web reader, and digital delivery."
        ),
        PublishingServiceUpgradeOption(
            tier: .digitalPlusPaperback,
            state: .gatedByValidation,
            includedFormats: [.digital, .paperback],
            requirements: ["Final page count", "Validated print specs", "Approved paperback wrap", "Human production approval"],
            summary: "Adds paperback preparation using validated trim, spine, bleed, safe-area, and barcode specifications."
        ),
        PublishingServiceUpgradeOption(
            tier: .digitalPlusPaperbackAndHardcover,
            state: .reserved,
            includedFormats: [.digital, .paperback, .hardcover],
            requirements: ["Paperback engine validated", "Hardcover template validation", "Final production approval"],
            summary: "Reserved for future activation after paperback wrap generation is fully validated."
        )
    ]

    public static func option(for tier: PublishingServiceTier) -> PublishingServiceUpgradeOption? {
        options.first { $0.tier == tier }
    }
}
