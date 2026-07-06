import Foundation

// MARK: - Template-Based Cover Assembly

public enum CoverTemplateRegionKind: String, Codable, CaseIterable, Identifiable {
    case backCover
    case spine
    case frontCover
    case barcode
    case authorBio
    case publisherMark
    case bleed
    case trim
    case safeArea

    public var id: String { rawValue }
}

public struct CoverTemplateRegion: Identifiable, Codable, Hashable {
    public let id: UUID
    public var kind: CoverTemplateRegionKind
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(
        id: UUID = UUID(),
        kind: CoverTemplateRegionKind,
        x: Double,
        y: Double,
        width: Double,
        height: Double
    ) {
        self.id = id
        self.kind = kind
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

public struct CoverAssemblyTemplate: Identifiable, Codable, Hashable {
    public let id: UUID
    public var name: String
    public var specification: PrintCoverSpecification
    public var regions: [CoverTemplateRegion]

    public init(
        id: UUID = UUID(),
        name: String,
        specification: PrintCoverSpecification,
        regions: [CoverTemplateRegion]
    ) {
        self.id = id
        self.name = name
        self.specification = specification
        self.regions = regions
    }
}

public enum CoverAssemblyTemplateEngine {
    public static func makePaperbackTemplate(specification: PrintCoverSpecification) -> CoverAssemblyTemplate {
        let trim = specification.trimSize.inches
        let bleed = specification.bleed
        let spine = specification.spineWidth
        let fullWidth = specification.fullWrapWidth
        let fullHeight = specification.fullWrapHeight
        let panelWidth = trim.width
        let panelHeight = trim.height
        let backX = bleed
        let frontX = bleed + panelWidth + spine
        let panelY = bleed

        let regions: [CoverTemplateRegion] = [
            CoverTemplateRegion(kind: .bleed, x: 0, y: 0, width: fullWidth, height: fullHeight),
            CoverTemplateRegion(kind: .backCover, x: backX, y: panelY, width: panelWidth, height: panelHeight),
            CoverTemplateRegion(kind: .spine, x: bleed + panelWidth, y: panelY, width: spine, height: panelHeight),
            CoverTemplateRegion(kind: .frontCover, x: frontX, y: panelY, width: panelWidth, height: panelHeight),
            CoverTemplateRegion(kind: .safeArea, x: backX + specification.safeMargin, y: panelY + specification.safeMargin, width: panelWidth - (specification.safeMargin * 2), height: panelHeight - (specification.safeMargin * 2)),
            CoverTemplateRegion(kind: .barcode, x: backX + panelWidth - specification.barcodeWidth - specification.safeMargin, y: panelY + panelHeight - specification.barcodeHeight - specification.safeMargin, width: specification.barcodeWidth, height: specification.barcodeHeight),
            CoverTemplateRegion(kind: .authorBio, x: backX + specification.safeMargin, y: panelY + panelHeight * 0.62, width: panelWidth - (specification.safeMargin * 2), height: panelHeight * 0.18),
            CoverTemplateRegion(kind: .publisherMark, x: bleed + panelWidth + (spine * 0.2), y: panelY + panelHeight - 0.6, width: max(0.1, spine * 0.6), height: 0.3)
        ]

        return CoverAssemblyTemplate(
            name: "KDP Paperback \(specification.trimSize.title)",
            specification: specification,
            regions: regions
        )
    }

    public static func region(_ kind: CoverTemplateRegionKind, in template: CoverAssemblyTemplate) -> CoverTemplateRegion? {
        template.regions.first { $0.kind == kind }
    }
}
