import SwiftData
import SwiftUI

struct CampaignEngineView: View {
    let campaignStore: LocalCampaignStore
    let sessionStore: LocalSessionStore

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedCampaignRecord.updatedAt, order: .reverse) private var campaigns: [PersistedCampaignRecord]
    @State private var showingEditor = false

    private var activeCampaigns: [PersistedCampaignRecord] {
        campaigns.filter { $0.statusRawValue != CampaignStatus.completed.rawValue }
    }

    private var approvalQueue: [PersistedCampaignRecord] {
        campaigns.filter { campaign in
            campaign.requiresApproval && campaign.approvedBy == nil
        }
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                campaignStatusSection
                approvalQueueSection
                campaignsSection
            }
            .navigationTitle("Campaigns")
            .toolbar { toolbarContent }
            .sheet(isPresented: $showingEditor) {
                CampaignEditorView()
            }
            .task { seedCampaignsIfNeeded() }
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Growth Engine",
                title: "Campaign Engine",
                bodyText: "Plan campaigns, manage approvals, track promo codes, and control launch readiness before external marketing goes live."
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var campaignStatusSection: some View {
        Section("Campaign Status") {
            LabeledContent("Active campaigns", value: "\(activeCampaigns.count)")
            LabeledContent("Approval queue", value: "\(approvalQueue.count)")
            Label("Human approval required before launch", systemImage: "hand.raised")
        }
    }

    private var approvalQueueSection: some View {
        Section("Approval Queue") {
            if approvalQueue.isEmpty {
                Text("No campaigns awaiting approval.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(approvalQueue) { campaign in
                    NavigationLink {
                        CampaignDetailView(sessionStore: sessionStore, campaign: campaign)
                    } label: {
                        CampaignListRow(campaign: campaign)
                    }
                }
            }
        }
    }

    private var campaignsSection: some View {
        Section("Campaigns") {
            if campaigns.isEmpty {
                Text("No campaigns yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(campaigns) { campaign in
                    NavigationLink {
                        CampaignDetailView(sessionStore: sessionStore, campaign: campaign)
                    } label: {
                        CampaignListRow(campaign: campaign)
                    }
                }
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showingEditor = true
            } label: {
                Label("New Campaign", systemImage: "plus")
            }
        }
    }

    private func seedCampaignsIfNeeded() {
        guard campaigns.isEmpty else { return }
        for campaign in SampleData.campaigns {
            modelContext.insert(PersistedCampaignRecord(campaign: campaign))
        }
    }
}

private struct CampaignListRow: View {
    let campaign: PersistedCampaignRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(campaign.title)
                .font(.headline)
            Text("\(campaign.channelRawValue) • \(campaign.audienceRawValue) • \(campaign.statusRawValue)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    CampaignEngineView(campaignStore: LocalCampaignStore(), sessionStore: LocalSessionStore())
        .modelContainer(for: PersistedCampaignRecord.self, inMemory: true)
}
