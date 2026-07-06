import SwiftUI

struct CustomerPortalView: View {
    let sessionStore: LocalSessionStore
    let customerStore: LocalCustomerPortalStore
    @State private var showingNewRequest = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SectionHeader(
                        eyebrow: "Portal First",
                        title: "Customer Portal",
                        bodyText: "Customer-facing intake, service onboarding, file-submission routing, support requests, and project handoff tracking."
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section("Portal Status") {
                    LabeledContent("Signed in as", value: sessionStore.session.user.name)
                    LabeledContent("Open requests", value: "\(customerStore.openRequests.count)")
                    Label("Canonical service onboarding enabled", systemImage: "checkmark.seal")
                }

                Section("Requests") {
                    ForEach(customerStore.requests) { request in
                        NavigationLink {
                            CustomerRequestDetailView(customerStore: customerStore, request: request)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(request.subject)
                                    .font(.headline)
                                Text("\(request.requestType.rawValue) • \(request.status.rawValue)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Customer")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingNewRequest = true
                    } label: {
                        Label("New Request", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingNewRequest) {
                CustomerRequestEditorView(sessionStore: sessionStore, customerStore: customerStore)
            }
        }
    }
}

#Preview {
    CustomerPortalView(sessionStore: LocalSessionStore(), customerStore: LocalCustomerPortalStore())
}
