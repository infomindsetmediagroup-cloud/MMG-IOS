import SwiftData
import SwiftUI

struct CustomerPortalView: View {
    let sessionStore: LocalSessionStore
    let customerStore: LocalCustomerPortalStore

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedCustomerRequestRecord.updatedAt, order: .reverse) private var requests: [PersistedCustomerRequestRecord]
    @State private var showingNewRequest = false

    private var openRequests: [PersistedCustomerRequestRecord] {
        requests.filter { $0.statusRawValue != CustomerRequestStatus.complete.rawValue }
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                portalStatusSection
                requestsSection
            }
            .navigationTitle("Customer")
            .toolbar { toolbarContent }
            .sheet(isPresented: $showingNewRequest) {
                CustomerRequestEditorView(sessionStore: sessionStore)
            }
            .task { seedRequestsIfNeeded() }
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Portal First",
                title: "Customer Portal",
                bodyText: "Customer-facing intake, service onboarding, file-submission routing, support requests, and project handoff tracking."
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var portalStatusSection: some View {
        Section("Portal Status") {
            LabeledContent("Signed in as", value: sessionStore.session.user.name)
            LabeledContent("Open requests", value: "\(openRequests.count)")
            Label("Canonical service onboarding enabled", systemImage: "checkmark.seal")
        }
    }

    private var requestsSection: some View {
        Section("Requests") {
            if requests.isEmpty {
                Text("No customer requests yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(requests) { request in
                    NavigationLink {
                        CustomerRequestDetailView(request: request)
                    } label: {
                        CustomerRequestRow(request: request)
                    }
                }
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showingNewRequest = true
            } label: {
                Label("New Request", systemImage: "plus")
            }
        }
    }

    private func seedRequestsIfNeeded() {
        guard requests.isEmpty else { return }
        for request in SampleData.customerRequests {
            modelContext.insert(PersistedCustomerRequestRecord(request: request))
        }
    }
}

private struct CustomerRequestRow: View {
    let request: PersistedCustomerRequestRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(request.subject)
                .font(.headline)
            Text("\(request.requestTypeRawValue) • \(request.statusRawValue)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    CustomerPortalView(sessionStore: LocalSessionStore(), customerStore: LocalCustomerPortalStore())
        .modelContainer(for: PersistedCustomerRequestRecord.self, inMemory: true)
}
