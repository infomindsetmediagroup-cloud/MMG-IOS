import SwiftUI

public struct PublishingVersionHistoryView: View {
    @State private var timeline: PublishingVersionTimeline

    public init(project: PublishingProject = .sample) {
        let base = PublishingVersionHistoryEngine.makeInitialTimeline(project: project)
        let withManuscript = PublishingVersionHistoryEngine.appendSnapshot(
            to: base,
            kind: .manuscript,
            title: "Manuscript Analyzed",
            summary: "Detected manuscript structure and generated the initial production brief."
        )
        let withCover = PublishingVersionHistoryEngine.appendSnapshot(
            to: withManuscript,
            kind: .cover,
            title: "Cover Template Prepared",
            summary: "Paperback wrap template generated from trim size, page count, bleed, and spine calculations.",
            production: true
        )
        _timeline = State(initialValue: withCover)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                snapshotList
            }
            .padding(20)
        }
        .navigationTitle("Version History")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Recoverable Project History")
                .font(.largeTitle.bold())
            Text("Every major publishing action creates a recoverable snapshot for audit, approval, and production rollback.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var snapshotList: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(timeline.snapshots.sorted { $0.revisionNumber > $1.revisionNumber }) { snapshot in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("v\(snapshot.revisionNumber)")
                            .font(.caption.monospacedDigit().bold())
                            .foregroundStyle(.secondary)
                        Text(snapshot.title)
                            .font(.headline)
                        Spacer()
                        if snapshot.isProductionSnapshot {
                            Text("PRODUCTION")
                                .font(.caption2.bold())
                                .foregroundStyle(.green)
                        }
                    }
                    Text(snapshot.summary)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    HStack {
                        Text(snapshot.kind.rawValue.capitalized)
                        Spacer()
                        Text(snapshot.createdAt, style: .date)
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }
}

#Preview {
    NavigationStack {
        PublishingVersionHistoryView()
    }
}
