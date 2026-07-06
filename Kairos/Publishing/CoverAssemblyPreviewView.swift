import SwiftUI

public struct CoverAssemblyPreviewView: View {
    public let template: CoverAssemblyTemplate

    public init(template: CoverAssemblyTemplate) {
        self.template = template
    }

    public var body: some View {
        GeometryReader { proxy in
            let scale = min(
                proxy.size.width / template.specification.fullWrapWidth,
                proxy.size.height / template.specification.fullWrapHeight
            )

            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(.thinMaterial)
                    .frame(
                        width: template.specification.fullWrapWidth * scale,
                        height: template.specification.fullWrapHeight * scale
                    )

                ForEach(template.regions) { region in
                    regionView(region, scale: scale)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .frame(minHeight: 260)
    }

    private func regionView(_ region: CoverTemplateRegion, scale: Double) -> some View {
        Rectangle()
            .strokeBorder(style: StrokeStyle(lineWidth: region.kind == .safeArea ? 1 : 2, dash: dashPattern(for: region.kind)))
            .foregroundStyle(color(for: region.kind))
            .background(background(for: region.kind))
            .overlay(alignment: .topLeading) {
                Text(label(for: region.kind))
                    .font(.caption2.bold())
                    .padding(4)
                    .background(.background.opacity(0.8), in: Capsule())
                    .padding(4)
            }
            .frame(width: region.width * scale, height: region.height * scale)
            .offset(x: region.x * scale, y: region.y * scale)
    }

    private func label(for kind: CoverTemplateRegionKind) -> String {
        switch kind {
        case .backCover: return "Back"
        case .spine: return "Spine"
        case .frontCover: return "Front"
        case .barcode: return "Barcode"
        case .authorBio: return "Bio"
        case .publisherMark: return "Mark"
        case .bleed: return "Bleed"
        case .trim: return "Trim"
        case .safeArea: return "Safe"
        }
    }

    private func dashPattern(for kind: CoverTemplateRegionKind) -> [CGFloat] {
        switch kind {
        case .safeArea, .bleed: return [6, 4]
        default: return []
        }
    }

    private func color(for kind: CoverTemplateRegionKind) -> Color {
        switch kind {
        case .backCover: return .blue
        case .spine: return .purple
        case .frontCover: return .green
        case .barcode: return .red
        case .authorBio: return .orange
        case .publisherMark: return .secondary
        case .bleed: return .secondary
        case .trim: return .primary
        case .safeArea: return .yellow
        }
    }

    private func background(for kind: CoverTemplateRegionKind) -> some ShapeStyle {
        switch kind {
        case .backCover, .frontCover: return .blue.opacity(0.08)
        case .spine: return .purple.opacity(0.12)
        case .barcode: return .red.opacity(0.1)
        case .authorBio: return .orange.opacity(0.1)
        default: return .clear
        }
    }
}

#Preview {
    CoverAssemblyPreviewView(
        template: CoverAssemblyTemplateEngine.makePaperbackTemplate(
            specification: PrintCoverSpecification(pageCount: 214)
        )
    )
    .padding()
}
