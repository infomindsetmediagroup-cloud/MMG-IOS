import SwiftUI

public struct PublishingMetadataView: View {
    @State private var profile: PublishingMetadataProfile

    public init(project: PublishingProject = .sample, analysis: ManuscriptAnalysisResult? = nil) {
        _profile = State(initialValue: PublishingMetadataGenerator.makeInitialProfile(project: project, analysis: analysis))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                descriptionCard
                keywordCard
                categoryCard
                identifierCard
            }
            .padding(20)
        }
        .navigationTitle("Metadata")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(profile.title)
                .font(.largeTitle.bold())
            Text(profile.subtitle.isEmpty ? "Publishing Metadata Profile" : profile.subtitle)
                .font(.title3)
                .foregroundStyle(.secondary)
            Text("Author: \(profile.authorName)")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var descriptionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Description")
                .font(.headline)
            TextField("Short description", text: $profile.shortDescription, axis: .vertical)
                .textFieldStyle(.roundedBorder)
            TextField("Full description", text: $profile.description, axis: .vertical)
                .lineLimit(4...8)
                .textFieldStyle(.roundedBorder)
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var keywordCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Keywords")
                .font(.headline)
            ForEach(profile.keywords) { keyword in
                HStack {
                    Text(keyword.phrase)
                        .font(.subheadline.weight(.medium))
                    Spacer()
                    Text("Priority \(keyword.priority)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(.background, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var categoryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Categories")
                .font(.headline)
            ForEach(profile.categories) { category in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(category.name)
                            .font(.subheadline.weight(.semibold))
                        Text(category.source.rawValue)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(category.confidence.formatted(.percent.precision(.fractionLength(0))))
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(.background, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var identifierCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Identifiers")
                .font(.headline)
            TextField("ISBN", text: Binding(get: { profile.isbn ?? "" }, set: { profile.isbn = $0.isEmpty ? nil : $0 }))
                .textFieldStyle(.roundedBorder)
            HStack {
                Text("Language")
                Spacer()
                Text(profile.languageCode)
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
            HStack {
                Text("Publisher")
                Spacer()
                Text(profile.publisherName)
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

#Preview {
    NavigationStack {
        PublishingMetadataView()
    }
}
