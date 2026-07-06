import SwiftUI

struct LaunchExperienceView: View {
    let onComplete: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stage: LaunchAnimationStage = .manuscript
    @State private var hasCompleted = false

    private let serviceCards = LaunchServiceCard.seededCards

    var body: some View {
        ZStack {
            LaunchBackgroundView(stage: stage)

            VStack(spacing: 28) {
                Spacer(minLength: 36)

                KairosLaunchMark(stage: stage)

                VStack(spacing: 10) {
                    Text("KAIROS")
                        .font(.system(size: 42, weight: .semibold, design: .rounded))
                        .tracking(7)
                        .foregroundStyle(.white)

                    Text("OPERATING SYSTEM")
                        .font(.caption.weight(.semibold))
                        .tracking(4)
                        .foregroundStyle(Color.mmgBlue)

                    Text("The operating system behind Mindset Media Group™")
                        .font(.subheadline.weight(.medium))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white.opacity(0.78))
                        .padding(.top, 4)
                }
                .padding(.horizontal, 28)

                LaunchServiceGrid(cards: serviceCards, stage: stage)
                    .padding(.horizontal, 18)

                Spacer(minLength: 32)

                Button("Skip") {
                    completeLaunch()
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.72))
                .padding(.bottom, 22)
                .accessibilityLabel("Skip Kairos launch experience")
            }
        }
        .task {
            await runSequence()
        }
    }

    private func runSequence() async {
        if reduceMotion {
            try? await Task.sleep(nanoseconds: 450_000_000)
            completeLaunch()
            return
        }

        await advance(after: 450_000_000, to: .transforming)
        await advance(after: 650_000_000, to: .services)
        await advance(after: 1_150_000_000, to: .commandSurface)
        try? await Task.sleep(nanoseconds: 750_000_000)
        completeLaunch()
    }

    private func advance(after delay: UInt64, to nextStage: LaunchAnimationStage) async {
        try? await Task.sleep(nanoseconds: delay)
        await MainActor.run {
            withAnimation(.spring(response: 0.7, dampingFraction: 0.82)) {
                stage = nextStage
            }
        }
    }

    private func completeLaunch() {
        guard !hasCompleted else { return }
        hasCompleted = true
        onComplete()
    }
}

enum LaunchAnimationStage {
    case manuscript
    case transforming
    case services
    case commandSurface
}

struct LaunchServiceCard: Identifiable {
    let id = UUID()
    let title: String
    let systemImage: String

    static let seededCards = [
        LaunchServiceCard(title: "Publishing", systemImage: "books.vertical"),
        LaunchServiceCard(title: "Customer Ops", systemImage: "person.text.rectangle"),
        LaunchServiceCard(title: "Production", systemImage: "shippingbox"),
        LaunchServiceCard(title: "Growth", systemImage: "chart.line.uptrend.xyaxis"),
        LaunchServiceCard(title: "Quality", systemImage: "checkmark.seal"),
        LaunchServiceCard(title: "Automation", systemImage: "sparkles")
    ]
}

private struct LaunchBackgroundView: View {
    let stage: LaunchAnimationStage

    var body: some View {
        ZStack {
            Color.mmgInk.ignoresSafeArea()

            RadialGradient(
                colors: [Color.mmgBlue.opacity(stage == .commandSurface ? 0.34 : 0.22), .clear],
                center: .topLeading,
                startRadius: 40,
                endRadius: 430
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [Color.mmgDeepBlue.opacity(0.56), .clear],
                center: .bottomTrailing,
                startRadius: 30,
                endRadius: 520
            )
            .ignoresSafeArea()
        }
    }
}

private struct KairosLaunchMark: View {
    let stage: LaunchAnimationStage

    private var markScale: CGFloat {
        switch stage {
        case .manuscript: return 0.86
        case .transforming: return 1.02
        case .services: return 0.94
        case .commandSurface: return 1.08
        }
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 38, style: .continuous)
                .fill(.black.opacity(0.36))
                .frame(width: 148, height: 148)
                .overlay(
                    RoundedRectangle(cornerRadius: 38, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                )
                .shadow(color: Color.mmgBlue.opacity(0.35), radius: 24, x: 0, y: 18)

            Circle()
                .trim(from: 0.08, to: 0.92)
                .stroke(
                    LinearGradient(
                        colors: [Color(red: 0.31, green: 0.85, blue: 1.0), Color.mmgBlue, Color(red: 0.0, green: 0.24, blue: 1.0)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    style: StrokeStyle(lineWidth: 8, lineCap: .round)
                )
                .frame(width: 96, height: 96)
                .rotationEffect(.degrees(stage == .commandSurface ? 18 : -8))

            Text("K")
                .font(.system(size: 62, weight: .medium, design: .rounded))
                .foregroundStyle(
                    LinearGradient(
                        colors: [.white, Color.mmgBlue],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )

            Circle()
                .fill(Color.white)
                .frame(width: 13, height: 13)
                .offset(x: 39, y: -42)
                .shadow(color: Color.mmgBlue, radius: 10)
        }
        .scaleEffect(markScale)
        .animation(.spring(response: 0.7, dampingFraction: 0.82), value: stage)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Kairos operating system launch mark")
    }
}

private struct LaunchServiceGrid: View {
    let cards: [LaunchServiceCard]
    let stage: LaunchAnimationStage

    private let columns = [GridItem(.adaptive(minimum: 128), spacing: 12)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in
                LaunchServiceCardView(card: card)
                    .opacity(stage == .services || stage == .commandSurface ? 1 : 0)
                    .offset(y: stage == .services || stage == .commandSurface ? 0 : 22)
                    .animation(.spring(response: 0.6, dampingFraction: 0.84).delay(Double(index) * 0.07), value: stage)
            }
        }
    }
}

private struct LaunchServiceCardView: View {
    let card: LaunchServiceCard

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: card.systemImage)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.mmgBlue)

            Text(card.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.88))
        }
        .frame(maxWidth: .infinity, minHeight: 86)
        .background(.white.opacity(0.065), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(.white.opacity(0.12), lineWidth: 1)
        )
    }
}

#Preview {
    LaunchExperienceView {}
}
