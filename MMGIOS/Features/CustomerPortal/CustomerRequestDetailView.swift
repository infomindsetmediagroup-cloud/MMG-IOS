import SwiftData
import SwiftUI

struct CustomerRequestDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Bindable var request: PersistedCustomerRequestRecord

    var body: some View {
        List {
            headerSection
            customerSection
            routingSection
            actionsSection
        }
        .navigationTitle("Request")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Text(request.requestTypeRawValue.uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.mmgBlue)
                    .tracking(1.2)

                Text(request.subject)
                    .font(.largeTitle.bold())

                Text(request.message)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 8)
        }
    }

    private var customerSection: some View {
        Section("Customer") {
            LabeledContent("Name", value: request.customerName)
            LabeledContent("Email", value: request.email)
            LabeledContent("Status", value: request.statusRawValue)
        }
    }

    private var routingSection: some View {
        Section("Routing") {
            ForEach(CustomerRequestStatus.allCases) { status in
                Button {
                    request.statusRawValue = status.rawValue
                    request.updatedAt = Date()
                } label: {
                    RequestStatusRow(status: status, selectedStatus: request.statusRawValue)
                }
            }
        }
    }

    private var actionsSection: some View {
        Section("Actions") {
            Button(role: .destructive) {
                modelContext.delete(request)
            } label: {
                Label("Delete Request", systemImage: "trash")
            }
        }
    }
}

private struct RequestStatusRow: View {
    let status: CustomerRequestStatus
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
    let request = PersistedCustomerRequestRecord(request: SampleData.customerRequests[0])
    return NavigationStack {
        CustomerRequestDetailView(request: request)
    }
    .modelContainer(for: PersistedCustomerRequestRecord.self, inMemory: true)
}
