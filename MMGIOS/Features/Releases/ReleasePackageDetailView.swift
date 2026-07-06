import SwiftUI

struct ReleasePackageDetailView: View {
    let releaseStore: LocalReleasePackageStore
    let package: ReleasePackage

    private var currentPackage: ReleasePackage {
        releaseStore.packages.first(where: { $0.id == package.id }) ?? package
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text("RELEASE PACKAGE")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.mmgBlue)
                        .tracking(1.2)

                    Text(currentPackage.title)
                        .font(.largeTitle.bold())

                    Text(currentPackage.summary)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Impact") {
                LabeledContent("Status", value: currentPackage.status.rawValue)
                Text(currentPackage.customerImpact)
                Text(currentPackage.validationSummary)
                    .foregroundStyle(.secondary)
            }

            Section("Internal Notes") {
                Text(currentPackage.internalNotes)
                    .foregroundStyle(.secondary)
            }

            Section("Status") {
                ForEach(ReleasePackageStatus.allCases) { status in
                    Button {
                        releaseStore.updateStatus(packageID: currentPackage.id, status: status)
                    } label: {
                        HStack {
                            Text(status.rawValue)
                            Spacer()
                            if currentPackage.status == status {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.mmgBlue)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Release")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        ReleasePackageDetailView(releaseStore: LocalReleasePackageStore(), package: SampleData.releasePackages[0])
    }
}
