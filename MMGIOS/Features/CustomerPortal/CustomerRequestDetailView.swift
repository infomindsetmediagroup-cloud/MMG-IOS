import SwiftUI

struct CustomerRequestDetailView: View {
    let customerStore: LocalCustomerPortalStore
    let request: CustomerPortalRequest

    private var currentRequest: CustomerPortalRequest {
        customerStore.requests.first(where: { $0.id == request.id }) ?? request
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(currentRequest.requestType.rawValue.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.mmgBlue)
                        .tracking(1.2)

                    Text(currentRequest.subject)
                        .font(.largeTitle.bold())

                    Text(currentRequest.message)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Customer") {
                LabeledContent("Name", value: currentRequest.customerName)
                LabeledContent("Email", value: currentRequest.email)
                LabeledContent("Status", value: currentRequest.status.rawValue)
            }

            Section("Routing") {
                ForEach(CustomerRequestStatus.allCases) { status in
                    Button {
                        customerStore.updateStatus(requestID: currentRequest.id, status: status)
                    } label: {
                        HStack {
                            Text(status.rawValue)
                            Spacer()
                            if currentRequest.status == status {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.mmgBlue)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Request")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        CustomerRequestDetailView(customerStore: LocalCustomerPortalStore(), request: SampleData.customerRequests[0])
    }
}
