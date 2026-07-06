import SwiftData
import SwiftUI

struct ReleasePackageDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Bindable var package: PersistedReleasePackageRecord

    var body: some View {
        List {
            headerSection
            impactSection
            internalNotesSection
            statusSection
            actionsSection
        }
        .navigationTitle("Release")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Text("RELEASE PACKAGE")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.mmgBlue)
                    .tracking(1.2)

                Text(package.title)
                    .font(.largeTitle.bold())

                Text(package.summary)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 8)
        }
    }

    private var impactSection: some View {
        Section("Impact") {
            LabeledContent("Status", value: package.statusRawValue)
            Text(package.customerImpact)
            Text(package.validationSummary)
                .foregroundStyle(.secondary)
        }
    }

    private var internalNotesSection: some View {
        Section("Internal Notes") {
            Text(package.internalNotes)
                .foregroundStyle(.secondary)
        }
    }

    private var statusSection: some View {
        Section("Status") {
            ForEach(ReleasePackageStatus.allCases) { status in
                Button {
                    package.statusRawValue = status.rawValue
                    package.updatedAt = Date()
                } label: {
                    ReleaseStatusRow(status: status, selectedStatus: package.statusRawValue)
                }
            }
        }
    }

    private var actionsSection: some View {
        Section("Actions") {
            Button(role: .destructive) {
                modelContext.delete(package)
            } label: {
                Label("Delete Release Package", systemImage: "trash")
            }
        }
    }
}

private struct ReleaseStatusRow: View {
    let status: ReleasePackageStatus
    let selectedStatus: String

    var body: some View {
        HStack {
            Text(status.rawValue)
            Spacer()
            if selectedStatus == status.rawValue {
                Image(systemName: "checkmark")
                    .foregroundStyle(.mmgBlue)
            }
        }
    }
}

#Preview {
    let package = PersistedReleasePackageRecord(package: SampleData.releasePackages[0])
    return NavigationStack {
        ReleasePackageDetailView(package: package)
    }
    .modelContainer(for: PersistedReleasePackageRecord.self, inMemory: true)
}
