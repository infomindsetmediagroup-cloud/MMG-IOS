import Foundation

// MARK: - Smart Cover Assembly Engine

public enum PrintBindingType: String, Codable, CaseIterable, Identifiable {
    case perfectBoundPaperback
    case caseLaminateHardcover

    public var id: String { rawValue }
}

public enum PrintTrimSize: String, Codable, CaseIterable, Identifiable {
    case fiveByEight
    case fivePointFiveByEightPointFive
    case sixByNine
    case sevenByTen
    case eightPointFiveByEleven

    public var id: String { rawValue }

    public var inches: (width: Double, height: Double) {
        switch self {
        case .fiveByEight: return (5.0, 8.0)
        case .fivePointFiveByEightPointFive: return (5.5, 8.5)
        case .sixByNine: return (6.0, 9.0)
        case .sevenByTen: return (7.0, 10.0)
        case .eightPointFiveByEleven: return (8.5, 11.0)
        }
    }

    public var title: String {
        switch self {
        case .fiveByEight: return "5 × 8 in"
        case .fivePointFiveByEightPointFive: return "5.5 × 8.5 in"
        case .sixByNine: return "6 × 9 in"
        case .sevenByTen: return "7 × 10 in"
        case .eightPointFiveByEleven: return "8.5 × 11 in"
        }
    }
}

public enum PrintInteriorType: String, Codable, CaseIterable, Identifiable {
    case blackAndWhiteWhitePaper
    case blackAndWhiteCreamPaper
    case standardColorWhitePaper
    case premiumColorWhitePaper

    public var id: String { rawValue }

    /// Approximate KDP-style spine multiplier in inches per page.
    public var spineMultiplier: Double {
        switch self {
        case .blackAndWhiteWhitePaper: return 0.002252
        case .blackAndWhiteCreamPaper: return 0.0025
        case .standardColorWhitePaper: return 0.002252
        case .premiumColorWhitePaper: return 0.002347
        }
    }
}

public struct PrintCoverSpecification: Codable, Hashable {
    public var trimSize: PrintTrimSize
    public var bindingType: PrintBindingType
    public var interiorType: PrintInteriorType
    public var pageCount: Int
    public var bleed: Double
    public var safeMargin: Double
    public var barcodeWidth: Double
    public var barcodeHeight: Double

    public var spineWidth: Double {
        Double(pageCount) * interiorType.spineMultiplier
    }

    public var fullWrapWidth: Double {
        let trim = trimSize.inches
        return (trim.width * 2) + spineWidth + (bleed * 2)
    }

    public var fullWrapHeight: Double {
        trimSize.inches.height + (bleed * 2)
    }

    public init(
        trimSize: PrintTrimSize = .sixByNine,
        bindingType: PrintBindingType = .perfectBoundPaperback,
        interiorType: PrintInteriorType = .blackAndWhiteWhitePaper,
        pageCount: Int,
        bleed: Double = 0.125,
        safeMargin: Double = 0.25,
        barcodeWidth: Double = 2.0,
        barcodeHeight: Double = 1.2
    ) {
        self.trimSize = trimSize
        self.bindingType = bindingType
        self.interiorType = interiorType
        self.pageCount = pageCount
        self.bleed = bleed
        self.safeMargin = safeMargin
        self.barcodeWidth = barcodeWidth
        self.barcodeHeight = barcodeHeight
    }
}

public struct CoverAssemblyInput: Codable, Hashable {
    public var frontCoverAssetName: String?
    public var backCoverCopy: String
    public var authorBio: String
    public var authorPhotoAssetName: String?
    public var publisherLogoAssetName: String?
    public var isbn: String?

    public init(
        frontCoverAssetName: String? = nil,
        backCoverCopy: String = "",
        authorBio: String = "",
        authorPhotoAssetName: String? = nil,
        publisherLogoAssetName: String? = nil,
        isbn: String? = nil
    ) {
        self.frontCoverAssetName = frontCoverAssetName
        self.backCoverCopy = backCoverCopy
        self.authorBio = authorBio
        self.authorPhotoAssetName = authorPhotoAssetName
        self.publisherLogoAssetName = publisherLogoAssetName
        self.isbn = isbn
    }
}

public struct CoverAssemblyResult: Codable, Hashable {
    public var specification: PrintCoverSpecification
    public var issues: [PublishingValidationIssue]
    public var isExportReady: Bool

    public init(specification: PrintCoverSpecification, issues: [PublishingValidationIssue]) {
        self.specification = specification
        self.issues = issues
        self.isExportReady = !issues.contains { $0.severity == .blocking }
    }
}

public enum SmartCoverAssemblyEngine {
    public static func validate(input: CoverAssemblyInput, specification: PrintCoverSpecification) -> CoverAssemblyResult {
        var issues: [PublishingValidationIssue] = []

        if specification.pageCount <= 0 {
            issues.append(.init(title: "Page Count Required", message: "Paperback wrap dimensions require a finalized page count.", severity: .blocking, affectedArea: "Print Specs"))
        }

        if input.frontCoverAssetName == nil {
            issues.append(.init(title: "Front Cover Missing", message: "Upload or generate front cover artwork before assembling the full wrap.", severity: .blocking, affectedArea: "Cover"))
        }

        if input.backCoverCopy.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append(.init(title: "Back Cover Copy Missing", message: "Back cover text is required before a paperback wrap can be exported.", severity: .blocking, affectedArea: "Back Cover"))
        }

        if input.isbn == nil {
            issues.append(.init(title: "ISBN Pending", message: "The barcode zone can be reserved now, but final export requires an ISBN or approved no-barcode decision.", severity: .warning, affectedArea: "Metadata"))
        }

        return CoverAssemblyResult(specification: specification, issues: issues)
    }
}
