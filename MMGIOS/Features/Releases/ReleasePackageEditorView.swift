import SwiftUI

struct ReleasePackageEditorView: View {
    let releaseStore: LocalReleasePackageStore
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
                Section("Release") {
                    TextField("Title", text: $title)
                    Picker("Status", selection: $status) {
                        ForEach(ReleasePackageStatus.allCases) { status in
                            Text(status.rawValue).tag(status)
                        }
                    }
                }

                Section("Summary") {
                    TextField("Summary", text: $summary, axis: .vertical)
                        .lineLimit(3, reservesSpace: true)
                    TextField("Customer Impact", text: $customerImpact, axis: .vertical)
                        .lineLimit(3, reservesSpace: true)
                    TextField("Validation Summary", text: $validationSummary, axis: .vertical)
                        .lineLimit(3, reservesSpace: true)
                }

                Section("Internal") {
                    TextField("Internal Notes", text: $internalNotes, axis: .vertical)
                        .lineLimit(4, reservesSpace: true)
                }
            }
            .navigationTitle("New Release")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { savePackage() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !customerImpact.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !validationSummary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func savePackage() {
        releaseStore.add(
            ReleasePackage(
                title: title,
                status: status,
                summary: summary,
                customerImpact: customerImpact,
                internalNotes: internalNotes,
                validationSummary: validationSummary
            )
        )
        dismiss()
    }
}

#Preview {
    ReleasePackageEditorView(releaseStore: LocalReleasePackageStore())
}
