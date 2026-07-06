import SwiftUI

struct ReleasePackageBuilderView: View {
    let releaseStore: LocalReleasePackageStore
    @State private var showingEditor = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SectionHeader(
                        eyebrow: "Ship Control",
                        title: "Release Package Builder",
                        bodyText: "Create release packages that summarize changes, customer impact, internal notes, validation status, and final ship readiness."
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section("Release Status") {
                    LabeledContent("Open packages", value: "\(releaseStore.openPackages.count)")
                    LabeledContent("Total packages", value: "\(releaseStore.packages.count)")
                    Label("Human approval required before external ship", systemImage: "hand.raised")
                }

                Section("Packages") {
                    ForEach(releaseStore.packages) { package in
                        NavigationLink {
                            ReleasePackageDetailView(releaseStore: releaseStore, package: package)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(package.title)
                                    .font(.headline)
                                Text(package.status.rawValue)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Releases")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingEditor = true
                    } label: {
                        Label("New Package", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingEditor) {
                ReleasePackageEditorView(releaseStore: releaseStore)
            }
        }
    }
}

#Preview {
    ReleasePackageBuilderView(releaseStore: LocalReleasePackageStore())
}
