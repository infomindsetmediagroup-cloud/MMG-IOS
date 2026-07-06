import SwiftUI

public struct PrintSpecificationView: View {
    @State private var trimSize: PrintTrimSize = .sixByNine
    @State private var interiorType: PrintInteriorType = .blackAndWhiteWhitePaper
    @State private var pageCount: Int = 214

    public init() {}

    public var body: some View {
        let specification = PrintCoverSpecification(
            trimSize: trimSize,
            interiorType: interiorType,
            pageCount: pageCount
        )
        let template = CoverAssemblyTemplateEngine.makePaperbackTemplate(specification: specification)

        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                controls
                specificationSummary(specification)
                CoverAssemblyPreviewView(template: template)
            }
            .padding(20)
        }
        .navigationTitle("Print Specs")
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Paperback Specification")
                .font(.headline)
            Picker("Trim Size", selection: $trimSize) {
                ForEach(PrintTrimSize.allCases) { size in
                    Text(size.title).tag(size)
                }
            }
            Picker("Interior", selection: $interiorType) {
                ForEach(PrintInteriorType.allCases) { type in
                    Text(interiorLabel(type)).tag(type)
                }
            }
            Stepper("Page Count: \(pageCount)", value: $pageCount, in: 24...828, step: 2)
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func specificationSummary(_ specification: PrintCoverSpecification) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Calculated Wrap")
                .font(.headline)
            metric("Spine Width", specification.spineWidth)
            metric("Full Wrap Width", specification.fullWrapWidth)
            metric("Full Wrap Height", specification.fullWrapHeight)
            metric("Bleed", specification.bleed)
            metric("Safe Margin", specification.safeMargin)
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func metric(_ title: String, _ value: Double) -> some View {
        HStack {
            Text(title)
                .font(.subheadline.weight(.semibold))
            Spacer()
            Text(value.formatted(.number.precision(.fractionLength(3))) + " in")
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(.secondary)
        }
    }

    private func interiorLabel(_ type: PrintInteriorType) -> String {
        switch type {
        case .blackAndWhiteWhitePaper: return "Black and White - White Paper"
        case .blackAndWhiteCreamPaper: return "Black and White - Cream Paper"
        case .standardColorWhitePaper: return "Standard Color - White Paper"
        case .premiumColorWhitePaper: return "Premium Color - White Paper"
        }
    }
}

#Preview {
    NavigationStack {
        PrintSpecificationView()
    }
}
