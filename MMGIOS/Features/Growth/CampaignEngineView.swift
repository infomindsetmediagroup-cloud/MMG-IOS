import SwiftUI

struct CampaignEngineView: View {
    let campaignStore: LocalCampaignStore
    let sessionStore: LocalSessionStore
    @State private var showingEditor = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SectionHeader(
                        eyebrow: "Growth Engine",
                        title: "Campaign Engine",
                        bodyText: "Plan campaigns, manage approvals, track promo codes, and control launch readiness before external marketing goes live."
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section("Campaign Status") {
                    LabeledContent("Active campaigns", value: "\(campaignStore.activeCampaigns.count)")
                    LabeledContent("Approval queue", value: "\(campaignStore.approvalQueue.count)")
                    Label("Human approval required before launch", systemImage: "hand.raised")
                }

                Section("Approval Queue") {
                    ForEach(campaignStore.approvalQueue) { campaign in
                        NavigationLink {
                            CampaignDetailView(campaignStore: campaignStore, sessionStore: sessionStore, campaign: campaign)
                        } label: {
                            CampaignListRow(campaign: campaign)
                        }
                    }
                }

                Section("Campaigns") {
                    ForEach(campaignStore.campaigns) { campaign in
                        NavigationLink {
                            CampaignDetailView(campaignStore: campaignStore, sessionStore: sessionStore, campaign: campaign)
                        } label: {
                            CampaignListRow(campaign: campaign)
                        }
                    }
                }
            }
            .navigationTitle("Campaigns")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingEditor = true
                    } label: {
                        Label("New Campaign", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingEditor) {
                CampaignEditorView(campaignStore: campaignStore)
            }
        }
    }
}

private struct CampaignListRow: View {
    let campaign: Campaign

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(campaign.title)
                .font(.headline)
            Text("\(campaign.channel.rawValue) • \(campaign.audience.rawValue) • \(campaign.status.rawValue)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    CampaignEngineView(campaignStore: LocalCampaignStore(), sessionStore: LocalSessionStore())
}
