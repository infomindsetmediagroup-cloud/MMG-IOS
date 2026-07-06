import SwiftUI

struct AppRootView: View {
    let sessionStore: LocalSessionStore
    @State private var projectStore = LocalProjectStore()
    @State private var qualityStore = LocalQualityStore()
    @State private var customerStore = LocalCustomerPortalStore()
    @State private var publishingStore = LocalPublishingStore()
    @State private var releaseStore = LocalReleasePackageStore()
    @State private var campaignStore = LocalCampaignStore()

    private var role: UserRole {
        sessionStore.session.user.role
    }

    var body: some View {
        TabView {
            if AccessPolicy.canAccess(.system, role: role) {
                KairosOperationsDashboardView()
                    .tabItem {
                        Label("Operations", systemImage: "command.circle")
                    }
            }

            if AccessPolicy.canAccess(.system, role: role) {
                ShopifyOperationsEngineView()
                    .tabItem {
                        Label("Shopify", systemImage: "bag")
                    }
            }

            if AccessPolicy.canAccess(.system, role: role) {
                KairosOperationalOrchestratorView()
                    .tabItem {
                        Label("Orchestrator", systemImage: "arrow.triangle.branch")
                    }
            }

            if AccessPolicy.canAccess(.command, role: role) {
                CommandCenterView(projectStore: projectStore)
                    .tabItem {
                        Label("Command", systemImage: "square.grid.2x2")
                    }
            }

            if AccessPolicy.canAccess(.customer, role: role) {
                CustomerPortalView(sessionStore: sessionStore, customerStore: customerStore)
                    .tabItem {
                        Label("Customer", systemImage: "person.text.rectangle")
                    }
            }

            if AccessPolicy.canAccess(.projects, role: role) {
                ProjectBoardView()
                    .tabItem {
                        Label("Projects", systemImage: "folder")
                    }
            }

            if AccessPolicy.canAccess(.publishing, role: role) {
                PublishingCommandCenterView(publishingStore: publishingStore)
                    .tabItem {
                        Label("Publishing", systemImage: "books.vertical")
                    }
            }

            if AccessPolicy.canAccess(.production, role: role) {
                ProductionCommandCenterView(projectStore: projectStore)
                    .tabItem {
                        Label("Production", systemImage: "shippingbox")
                    }
            }

            if AccessPolicy.canAccess(.quality, role: role) {
                QualityReleaseView(projectStore: projectStore, qualityStore: qualityStore)
                    .tabItem {
                        Label("Quality", systemImage: "checkmark.seal")
                    }
            }

            if AccessPolicy.canAccess(.releases, role: role) {
                ReleasePackageBuilderView(releaseStore: releaseStore)
                    .tabItem {
                        Label("Releases", systemImage: "archivebox")
                    }
            }

            if AccessPolicy.canAccess(.growth, role: role) {
                CampaignEngineView(campaignStore: campaignStore, sessionStore: sessionStore)
                    .tabItem {
                        Label("Growth", systemImage: "chart.line.uptrend.xyaxis")
                    }
            }

            if AccessPolicy.canAccess(.system, role: role) {
                SystemSettingsView(projectStore: projectStore, sessionStore: sessionStore)
                    .tabItem {
                        Label("System", systemImage: "gearshape")
                    }
            }
        }
        .tint(.mmgBlue)
    }
}

#Preview {
    AppRootView(sessionStore: LocalSessionStore())
}
