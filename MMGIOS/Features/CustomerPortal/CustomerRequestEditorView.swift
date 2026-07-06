import SwiftData
import SwiftUI

struct CustomerRequestEditorView: View {
    let sessionStore: LocalSessionStore
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var customerName = ""
    @State private var email = ""
    @State private var requestType: CustomerRequestType = .onboarding
    @State private var subject = ""
    @State private var message = ""

    var body: some View {
        NavigationStack {
            Form {
                customerSection
                requestSection
            }
            .navigationTitle("New Request")
            .onAppear(perform: seedUserDefaults)
            .toolbar { toolbarContent }
        }
    }

    private var customerSection: some View {
        Section("Customer") {
            TextField("Name", text: $customerName)
            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
    }

    private var requestSection: some View {
        Section("Request") {
            Picker("Type", selection: $requestType) {
                ForEach(CustomerRequestType.allCases) { type in
                    Text(type.rawValue).tag(type)
                }
            }

            TextField("Subject", text: $subject)
            TextField("Message", text: $message, axis: .vertical)
                .lineLimit(4, reservesSpace: true)
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { dismiss() }
        }

        ToolbarItem(placement: .confirmationAction) {
            Button("Save") { saveRequest() }
                .disabled(!canSave)
        }
    }

    private var canSave: Bool {
        !customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func seedUserDefaults() {
        if customerName.isEmpty { customerName = sessionStore.session.user.name }
        if email.isEmpty { email = sessionStore.session.user.email }
    }

    private func saveRequest() {
        let request = CustomerPortalRequest(
            customerName: customerName.trimmingCharacters(in: .whitespacesAndNewlines),
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            requestType: requestType,
            subject: subject.trimmingCharacters(in: .whitespacesAndNewlines),
            message: message.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        modelContext.insert(PersistedCustomerRequestRecord(request: request))
        dismiss()
    }
}

#Preview {
    CustomerRequestEditorView(sessionStore: LocalSessionStore())
        .modelContainer(for: PersistedCustomerRequestRecord.self, inMemory: true)
}
