import SwiftUI

struct MetricCard: View {
    let metric: OperationalMetric

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: metric.systemImage)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.mmgBlue)

            Text(metric.value)
                .font(.title.bold())
                .foregroundStyle(.primary)

            VStack(alignment: .leading, spacing: 4) {
                Text(metric.title)
                    .font(.headline)

                Text(metric.caption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct CommandCenterCard: View {
    let center: CommandCenter

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                Image(systemName: center.systemImage)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.mmgBlue.gradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                Spacer()

                Text(center.status.rawValue)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(center.status.color.opacity(0.14), in: Capsule())
                    .foregroundStyle(center.status.color)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(center.title)
                    .font(.headline)

                Text(center.subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(center.priority.rawValue)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .background(Color.mmgSurface, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
}

struct SectionHeader: View {
    let eyebrow: String
    let title: String
    let bodyText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(.mmgBlue)
                .tracking(1.2)

            Text(title)
                .font(.largeTitle.bold())
                .foregroundStyle(.primary)

            Text(bodyText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CustomerValueHeroCard: View {
    var promise: String = "Your Knowledge Has Value."
    var support: String = "Helping you discover it, build it, and share it with the world."
    var positioning: String = "Build around the value only you can provide."

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("MMG Customer Value Runtime".uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(.mmgBlue)
                .tracking(1.2)

            Text(promise)
                .font(.system(size: 42, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)
                .minimumScaleFactor(0.74)

            Text(support)
                .font(.headline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text(positioning)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.mmgBlue)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(
            LinearGradient(
                colors: [Color.mmgBlue.opacity(0.18), Color.mmgSurface],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 30, style: .continuous)
        )
    }
}

struct CustomerValueStep: Identifiable, Hashable {
    let id = UUID()
    let title: String
    let detail: String
}

struct CustomerValuePathCard: View {
    let steps: [CustomerValueStep]

    init(steps: [CustomerValueStep] = CustomerValuePathCard.defaultSteps) {
        self.steps = steps
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(
                eyebrow: "Guided Path",
                title: "From hidden knowledge to durable asset.",
                bodyText: "Kairos should help every customer identify what they already know, package it clearly, and move it toward content, products, services, or other practical opportunities."
            )

            ForEach(steps) { step in
                VStack(alignment: .leading, spacing: 6) {
                    Text(step.title)
                        .font(.headline)
                    Text(step.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .padding(18)
        .background(Color.mmgSurface, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    static let defaultSteps: [CustomerValueStep] = [
        .init(title: "Outcome", detail: "Move toward income, opportunity, independence, or growth without shortcut promises."),
        .init(title: "Identity", detail: "Reflect the customer's existing knowledge, skill, experience, creativity, and perspective."),
        .init(title: "Agency", detail: "Show the customer that their value can become something real and useful."),
        .init(title: "Guidance", detail: "Use Kairos as the steady teacher, memory, strategist, and next-action engine."),
        .init(title: "System", detail: "Connect content, products, services, publishing, and commerce into one compounding body of work.")
    ]
}

struct CustomerValueMicrocopyCard: View {
    let lines: [String]

    init(lines: [String] = [
        "Start with what you already know.",
        "Package the value. Preserve the context. Move the work forward.",
        "Your work is not isolated content. It is a body of work in progress.",
        "The next action should make the asset stronger."
    ]) {
        self.lines = lines
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Kairos Guidance Language".uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(.mmgBlue)
                .tracking(1.2)

            ForEach(lines, id: \.self) { line in
                Text(line)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}
