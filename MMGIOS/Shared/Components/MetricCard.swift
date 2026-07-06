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
