import SwiftUI

struct ShopifyOperationsRuntimeView: View {
    @Environment(KairosRuntime.self) private var runtime

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Shopify Operations Engine", systemImage: "bag.badge.plus")
                            .font(.title2.weight(.semibold))
                        Text("\(runtime.state.operatingMode.rawValue) mode • \(runtime.state.activeBatch)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }

                Section("Commerce Workspaces") {
                    ForEach(runtime.shopifyWorkspaces) { workspace in
                        RuntimeRow(title: workspace.title, detail: workspace.detail, systemImage: workspace.systemImage)
                    }
                }

                Section("Publishing Pipeline") {
                    ForEach(runtime.shopifyPipeline) { item in
                        RuntimeProgressRow(title: item.title, detail: item.detail, status: item.status.rawValue, progress: item.progress, systemImage: item.systemImage)
                    }
                }

                Section("Product Queue") {
                    ForEach(runtime.productQueue) { product in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(product.title).font(.headline)
                                Spacer()
                                Text(product.productType).font(.caption.weight(.semibold))
                            }
                            Text(product.detail).font(.caption).foregroundStyle(.secondary)
                            Text(product.tags.joined(separator: " • "))
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section("Connected Engines") {
                    ForEach(runtime.connectedEngines) { engine in
                        RuntimeRow(title: engine.title, detail: engine.state, systemImage: engine.systemImage)
                    }
                }
            }
            .navigationTitle("Shopify")
        }
    }
}

private struct RuntimeRow: View {
    let title: String
    let detail: String
    let systemImage: String

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(.mmgBlue)
        }
    }
}

private struct RuntimeProgressRow: View {
    let title: String
    let detail: String
    let status: String
    let progress: Double
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Label(title, systemImage: systemImage).font(.headline)
                Spacer()
                Text(status).font(.caption.weight(.semibold))
            }
            Text(detail).font(.caption).foregroundStyle(.secondary)
            ProgressView(value: progress)
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    ShopifyOperationsRuntimeView()
        .environment(KairosRuntime())
}
