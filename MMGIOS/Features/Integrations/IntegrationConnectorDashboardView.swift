import SwiftData
import SwiftUI

struct IntegrationConnectorDashboardView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \IntegrationConnectorRecord.updatedAt, order: .reverse) private var connectors: [IntegrationConnectorRecord]

    private let connectorService = IntegrationConnectorService()

    private var connectedCount: Int {
        connectors.filter { $0.status == IntegrationConnectionStatus.connected.rawValue }.count
    }

    private var socialConnectors: [IntegrationConnectorRecord] {
        connectors.filter { $0.category == IntegrationCategory.social.rawValue }
    }

    private var productionEnabledCount: Int {
        connectors.filter(\.isProductionEnabled).count
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Integration Framework") {
                    LabeledContent("Connectors", value: "\(connectors.count)")
                    LabeledContent("Connected", value: "\(connectedCount)")
                    LabeledContent("Social", value: "\(socialConnectors.count)")
                    LabeledContent("Production enabled", value: "\(productionEnabledCount)")
                    Text("Turnkey connector framework for Shopify, OpenAI, social platforms, and future custom APIs.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Connector Registry") {
                    if connectors.isEmpty {
                        Text("No connectors seeded yet. Seed the default connector registry to prepare plug-and-play integrations.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(connectors) { connector in
                            connectorRow(connector)
                        }
                    }
                }

                Section("Security Rule") {
                    Text("Do not store social usernames or passwords in the app. Production connectors should use OAuth, server-side secrets, scoped tokens, and auditable permission grants.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Integrations")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button("Seed") { seedDefaultConnectors() }
                    Button("Connect Demo") { connectFirstReadyConnector() }
                    Button("Enable") { enableFirstConnectedConnector() }
                }
            }
            .task { seedDefaultConnectors() }
        }
    }

    private func connectorRow(_ connector: IntegrationConnectorRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(connector.displayName)
                    .font(.headline)
                Spacer()
                Text(connector.status)
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
            Text("\(connector.provider) • \(connector.category) • \(connector.authMode)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(connector.accountHandle.isEmpty ? "No account connected" : connector.accountHandle)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(connector.capabilityRawValues.joined(separator: " • "))
                .font(.caption2)
                .foregroundStyle(.secondary)
            if !connector.notes.isEmpty {
                Text(connector.notes)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func seedDefaultConnectors() {
        connectorService.makeDefaultConnectors().forEach { connector in
            if connectors.contains(where: { $0.id == connector.id }) == false {
                modelContext.insert(connector)
            }
        }
        try? modelContext.save()
    }

    private func connectFirstReadyConnector() {
        guard let connector = connectors.first(where: { $0.status == IntegrationConnectionStatus.readyToConnect.rawValue || $0.status == IntegrationConnectionStatus.notConfigured.rawValue }) else { return }
        connectorService.connect(connector, accountHandle: "demo://\(connector.provider.lowercased().replacingOccurrences(of: " ", with: "-"))")
        try? modelContext.save()
    }

    private func enableFirstConnectedConnector() {
        guard let connector = connectors.first(where: { $0.status == IntegrationConnectionStatus.connected.rawValue && !$0.isProductionEnabled }) else { return }
        connectorService.enableProduction(connector)
        try? modelContext.save()
    }
}

#Preview {
    IntegrationConnectorDashboardView()
        .modelContainer(for: [IntegrationConnectorRecord.self], inMemory: true)
}
