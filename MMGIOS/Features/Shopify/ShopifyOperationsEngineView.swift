import SwiftUI

struct ShopifyOperationsEngineView: View {
    private let commandCards = ShopifyOperationsSeed.commandCards
    private let pipelineItems = ShopifyOperationsSeed.pipelineItems
    private let productQueues = ShopifyOperationsSeed.productQueues
    private let integrationItems = ShopifyOperationsSeed.integrationItems

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    hero
                    commandGrid
                    publishingPipeline
                    productQueue
                    integrationMap
                    automationNote
                }
                .padding(20)
            }
            .background(ShopifyOperationsPalette.ink.ignoresSafeArea())
            .navigationTitle("Shopify")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(ShopifyOperationsPalette.blue.opacity(0.18))
                        .frame(width: 64, height: 64)

                    Image(systemName: "bag.badge.plus")
                        .font(.system(size: 31, weight: .semibold))
                        .foregroundStyle(ShopifyOperationsPalette.blue)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Shopify Operations Engine")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)

                    Text("The commerce control layer for products, pages, pricing, vault access, and publication readiness.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.70))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack(spacing: 10) {
                ShopifyMetricPill(title: "Mode", value: "Prep", systemImage: "wrench.and.screwdriver")
                ShopifyMetricPill(title: "Publish", value: "Approval", systemImage: "checkmark.seal")
            }
        }
        .padding(18)
        .background(ShopifyOperationsPalette.card, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 1)
        )
    }

    private var commandGrid: some View {
        ShopifySection(title: "Commerce Workspaces", subtitle: "Operational surfaces Kairos will use to prepare and manage MMG storefront work.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 155), spacing: 12)], spacing: 12) {
                ForEach(commandCards) { card in
                    VStack(alignment: .leading, spacing: 11) {
                        Image(systemName: card.systemImage)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(ShopifyOperationsPalette.blue)

                        Text(card.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)

                        Text(card.detail)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.62))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, minHeight: 138, alignment: .topLeading)
                    .padding(16)
                    .background(.white.opacity(0.052), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
            }
        }
    }

    private var publishingPipeline: some View {
        ShopifySection(title: "Publishing Pipeline", subtitle: "Each Shopify-ready product must move through this production route.") {
            VStack(spacing: 10) {
                ForEach(Array(pipelineItems.enumerated()), id: \.element.id) { index, item in
                    HStack(alignment: .top, spacing: 12) {
                        Text(String(format: "%02d", index + 1))
                            .font(.caption.weight(.bold))
                            .foregroundStyle(ShopifyOperationsPalette.blue)
                            .frame(width: 34, height: 34)
                            .background(ShopifyOperationsPalette.blue.opacity(0.14), in: Circle())

                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)

                            Text(item.detail)
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.62))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer()

                        Text(item.state)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(item.state == "Active" ? ShopifyOperationsPalette.blue : .white.opacity(0.58))
                    }
                    .padding(14)
                    .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
        }
    }

    private var productQueue: some View {
        ShopifySection(title: "Product Queue", subtitle: "Seed queue for the first commerce operating pass.") {
            VStack(spacing: 12) {
                ForEach(productQueues) { item in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(item.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                            Spacer()
                            Text(item.type)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(ShopifyOperationsPalette.blue)
                        }

                        Text(item.detail)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.62))

                        HStack(spacing: 8) {
                            ForEach(item.tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.white.opacity(0.74))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 5)
                                    .background(.white.opacity(0.075), in: Capsule())
                            }
                        }
                    }
                    .padding(15)
                    .background(.white.opacity(0.052), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
            }
        }
    }

    private var integrationMap: some View {
        ShopifySection(title: "Connected Engines", subtitle: "The Shopify layer does not operate alone.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 155), spacing: 12)], spacing: 12) {
                ForEach(integrationItems) { item in
                    HStack(spacing: 10) {
                        Image(systemName: item.systemImage)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(ShopifyOperationsPalette.blue)
                            .frame(width: 32, height: 32)
                            .background(.white.opacity(0.06), in: Circle())

                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.title)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.white)
                            Text(item.state)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.white.opacity(0.58))
                        }

                        Spacer()
                    }
                    .padding(13)
                    .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
            }
        }
    }

    private var automationNote: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Phase 1 Automation Rule")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)

            Text("Kairos prepares listings, pricing, metadata, customer guides, vault assignments, and publication packages now. Always-on Shopify API execution is reserved for the backend phase, but the workflow is structured so it can be connected without redesign.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .background(ShopifyOperationsPalette.blue.opacity(0.10), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(ShopifyOperationsPalette.blue.opacity(0.24), lineWidth: 1)
        )
    }
}

private struct ShopifySection<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.58))
            }
            content
        }
    }
}

private struct ShopifyMetricPill: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
            VStack(alignment: .leading, spacing: 1) {
                Text(title.uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white.opacity(0.52))
                Text(value)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(.white.opacity(0.07), in: Capsule())
    }
}

private enum ShopifyOperationsPalette {
    static let ink = Color(red: 0.04, green: 0.06, blue: 0.10)
    static let card = Color(red: 0.08, green: 0.10, blue: 0.15)
    static let blue = Color(red: 0.31, green: 0.85, blue: 1.0)
}

private enum ShopifyOperationsSeed {
    static let commandCards = [
        ShopifyCommandCard(title: "Products", detail: "Create, stage, price, and package digital products, books, services, and licenses.", systemImage: "shippingbox"),
        ShopifyCommandCard(title: "Collections", detail: "Group products by series, system, module, license, and customer journey.", systemImage: "square.grid.3x3"),
        ShopifyCommandCard(title: "Pages", detail: "Prepare public pages, portal pages, Knowledge Library areas, and sales pages.", systemImage: "doc.richtext"),
        ShopifyCommandCard(title: "Navigation", detail: "Control canonical menus, pathways, cross-links, and customer routes.", systemImage: "point.topleft.down.curvedto.point.bottomright.up"),
        ShopifyCommandCard(title: "SEO", detail: "Generate titles, descriptions, structured product metadata, and internal links.", systemImage: "magnifyingglass"),
        ShopifyCommandCard(title: "Publishing", detail: "Hold publication until approval, validation, and release package readiness.", systemImage: "paperplane")
    ]

    static let pipelineItems = [
        ShopifyPipelineItem(title: "Manufacture Product", detail: "Create product package through the Product Manufacturing Engine.", state: "Active"),
        ShopifyPipelineItem(title: "Assign Pricing", detail: "Apply Pricing Intelligence rules and store the Pricing Record.", state: "Ready"),
        ShopifyPipelineItem(title: "Generate Listing", detail: "Produce title, description, images, SEO, customer guide, and cross-sells.", state: "Ready"),
        ShopifyPipelineItem(title: "Assign Vault Access", detail: "Map product to Free Vault, purchased assets, modules, systems, or licenses.", state: "Ready"),
        ShopifyPipelineItem(title: "Validate Release", detail: "Check branding, white-label status, links, metadata, and publication readiness.", state: "Ready")
    ]

    static let productQueues = [
        ShopifyProductQueueItem(title: "Entrepreneur Operating System", type: "System", detail: "Flagship accessible business-building package with modules, guides, SOPs, templates, and vault access.", tags: ["$199.95", "System", "Vault"]),
        ShopifyProductQueueItem(title: "AI Business OS Replication Package", type: "Premium", detail: "Instruction-set package for customers building their own AI-assisted business operating system.", tags: ["$299.95+", "AI OS", "License"]),
        ShopifyProductQueueItem(title: "KDP-Ready Knowledge Asset", type: "Download", detail: "Customer-facing book package with interior, cover, product guide, and implementation materials.", tags: ["$39.95+", "KDP", "Guide"]),
        ShopifyProductQueueItem(title: "Commercial License", type: "License", detail: "White-label rights package for derivative branded systems without MMG branding.", tags: ["$399.95", "Rights", "White-Label"])
    ]

    static let integrationItems = [
        ShopifyIntegrationItem(title: "Knowledge Bank", state: "Source", systemImage: "brain"),
        ShopifyIntegrationItem(title: "Pricing Engine", state: "Rules", systemImage: "tag"),
        ShopifyIntegrationItem(title: "Product Engine", state: "Manufacturing", systemImage: "gearshape.2"),
        ShopifyIntegrationItem(title: "System Vault", state: "Entitlements", systemImage: "lock.rectangle.stack"),
        ShopifyIntegrationItem(title: "White-Label", state: "Branding", systemImage: "wand.and.stars"),
        ShopifyIntegrationItem(title: "Release Gate", state: "Validation", systemImage: "checkmark.seal")
    ]
}

private struct ShopifyCommandCard: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let systemImage: String
}

private struct ShopifyPipelineItem: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let state: String
}

private struct ShopifyProductQueueItem: Identifiable {
    let id = UUID()
    let title: String
    let type: String
    let detail: String
    let tags: [String]
}

private struct ShopifyIntegrationItem: Identifiable {
    let id = UUID()
    let title: String
    let state: String
    let systemImage: String
}

#Preview {
    ShopifyOperationsEngineView()
}
