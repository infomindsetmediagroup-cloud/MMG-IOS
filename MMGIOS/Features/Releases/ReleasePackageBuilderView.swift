import SwiftData
import SwiftUI

struct ReleasePackageBuilderView: View {
    let releaseStore: LocalReleasePackageStore

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedReleasePackageRecord.updatedAt, order: .reverse) private var packages: [PersistedReleasePackageRecord]
    @State private var showingEditor = false

    private var openPackages: [PersistedReleasePackageRecord] {
        packages.filter { $0.statusRawValue != ReleasePackageStatus.shipped.rawValue }
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                releaseStatusSection
                packagesSection
            }
            .navigationTitle("Releases")
            .toolbar { toolbarContent }
            .sheet(isPresented: $showingEditor) {
                ReleasePackageEditorView()
            }
            .task { seedPackagesIfNeeded() }
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Ship Control",
                title: "Release Package Builder",
                bodyText: "Create release packages that summarize changes, customer impact, internal notes, validation status, and final ship readiness."
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var releaseStatusSection: some View {
        Section("Release Status") {
            LabeledContent("Open packages", value: "\(openPackages.count)")
            LabeledContent("Total packages", value: "\(packages.count)")
            Label("Human approval required before external ship", systemImage: "hand.raised")
        }
    }

    private var packagesSection: some View {
        Section("Packages") {
            if packages.isEmpty {
                Text("No release packages yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(packages) { package in
                    NavigationLink {
                        ReleasePackageDetailView(package: package)
                    } label: {
                        ReleasePackageRow(package: package)
                    }
                }
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showingEditor = true
            } label: {
                Label("New Package", systemImage: "plus")
            }
        }
    }

    private func seedPackagesIfNeeded() {
        guard packages.isEmpty else { return }
        for package in SampleData.releasePackages {
            modelContext.insert(PersistedReleasePackageRecord(package: package))
        }
    }
}

private struct ReleasePackageRow: View {
    let package: PersistedReleasePackageRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(package.title)
                .font(.headline)
            Text(package.statusRawValue)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    ReleasePackageBuilderView(releaseStore: LocalReleasePackageStore())
        .modelContainer(for: PersistedReleasePackageRecord.self, inMemory: true)
}
