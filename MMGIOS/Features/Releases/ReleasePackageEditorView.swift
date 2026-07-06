import SwiftData
import SwiftUI

struct ReleasePackageEditorView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var status: ReleasePackageStatus = .draft
    @State private var summary = ""
    @State private var customerImpact = ""
    @State private var internalNotes = ""
    @State private var validationSummary = ""

    var body: some View {
        NavigationStack {
            Form {
                releaseSection
                summarySection
                internalSection
            }
            .navigationTitle("New Release")
            .toolbar { toolbarContent }
        }
    }

    private var releaseSection: some View {
        Section("Release") {
            TextField("Title", text: $title)
            Picker("Status", selection: $status) {
                ForEach(ReleasePackageStatus.allCases) { status in
                    Text(status.rawValue).tag(status)
                }
            }
        }
    }

    private var summarySection: some View {
        Section("Summary") {
            TextField("Summary", text: $summary, axis: .vertical)
                .lineLimit(3, reservesSpace: true)
            TextField("Customer Impact", text: $customerImpact, axis: .vertical)
                .lineLimit(3, reservesSpace: true)
            TextField("Validation Summary", text: $validationSummary, axis: .vertical)
                .lineLimit(3, reservesSpace: true)
        }
    }

    private var internalSection: some View {
        Section("Internal") {
            TextField("Internal Notes", text: $internalNotes, axis: .vertical)
                .lineLimit(4, reservesSpace: true)
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { dismiss() }
        }

        ToolbarItem(placement: .confirmationAction) {
            Button("Save") { savePackage() }
                .disabled(!canSave)
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !customerImpact.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !validationSummary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func savePackage() {
        let package = ReleasePackage(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            status: status,
            summary: summary.trimmingCharacters(in: .whitespacesAndNewlines),
            customerImpact: customerImpact.trimmingCharacters(in: .whitespacesAndNewlines),
            internalNotes: internalNotes.trimmingCharacters(in: .whitespacesAndNewlines),
            validationSummary: validationSummary.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        modelContext.insert(PersistedReleasePackageRecord(package: package))
        dismiss()
    }
}

#Preview {
    ReleasePackageEditorView()
        .modelContainer(for: PersistedReleasePackageRecord.self, inMemory: true)
}
