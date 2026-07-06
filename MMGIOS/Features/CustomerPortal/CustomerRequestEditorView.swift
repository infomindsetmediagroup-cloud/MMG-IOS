import SwiftUI

struct CustomerRequestEditorView: View {
    let sessionStore: LocalSessionStore
    let customerStore: LocalCustomerPortalStore
    @Environment(\.dismiss) private var dismiss

    @State private var customerName = ""
    @State private var email = ""
    @State private var requestType: CustomerRequestType = .onboarding
    @State private var subject = ""
    @State private var message = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Customer") {
                    TextField("Name", text: $customerName)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

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
            .navigationTitle("New Request")
            .onAppear {
                if customerName.isEmpty {
                    customerName = sessionStore.session.user.name
                }
                if email.isEmpty {
                    email = sessionStore.session.user.email
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveRequest() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private var canSave: Bool {
        !customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func saveRequest() {
        customerStore.add(
            CustomerPortalRequest(
                customerName: customerName,
                email: email,
                requestType: requestType,
                subject: subject,
                message: message
            )
        )
        dismiss()
    }
}

#Preview {
    CustomerRequestEditorView(sessionStore: LocalSessionStore(), customerStore: LocalCustomerPortalStore())
}
