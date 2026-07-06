import SwiftData
import SwiftUI

struct CampaignDetailView: View {
    let sessionStore: LocalSessionStore
    @Environment(\.modelContext) private var modelContext
    @Bindable var campaign: PersistedCampaignRecord

    private var canLaunch: Bool {
        !campaign.requiresApproval ||
        campaign.approvedBy != nil ||
        campaign.statusRawValue == CampaignStatus.approved.rawValue ||
        campaign.statusRawValue == CampaignStatus.scheduled.rawValue ||
        campaign.statusRawValue == CampaignStatus.live.rawValue ||
        campaign.statusRawValue == CampaignStatus.completed.rawValue
    }

    var body: some View {
        List {
            headerSection
            campaignSection
            approvalSection
            statusSection
            actionsSection
        }
        .navigationTitle("Campaign")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Text(campaign.channelRawValue.uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.mmgBlue)
                    .tracking(1.2)

                Text(campaign.title)
                    .font(.largeTitle.bold())

                Text(campaign.objective)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 8)
        }
    }

    private var campaignSection: some View {
        Section("Campaign") {
            LabeledContent("Status", value: campaign.statusRawValue)
            LabeledContent("Audience", value: campaign.audienceRawValue)
            LabeledContent("Offer", value: campaign.offer)
            LabeledContent("Landing Page", value: campaign.landingPagePath)
            LabeledContent("Can Launch", value: canLaunch ? "Yes" : "No")
        }
    }

    private var approvalSection: some View {
        Section("Approval") {
            if let approvedBy = campaign.approvedBy {
                LabeledContent("Approved By", value: approvedBy)
            } else {
                Button {
                    campaign.approvedBy = sessionStore.session.user.name
                    campaign.statusRawValue = CampaignStatus.approved.rawValue
                    campaign.updatedAt = Date()
                } label: {
                    Label("Approve Campaign", systemImage: "hand.thumbsup")
                }
            }
        }
    }

    private var statusSection: some View {
        Section("Status") {
            ForEach(CampaignStatus.allCases) { status in
                Button {
                    campaign.statusRawValue = status.rawValue
                    campaign.updatedAt = Date()
                } label: {
                    CampaignStatusRow(status: status, selectedStatus: campaign.statusRawValue)
                }
            }
        }
    }

    private var actionsSection: some View {
        Section("Actions") {
            Button(role: .destructive) {
                modelContext.delete(campaign)
            } label: {
                Label("Delete Campaign", systemImage: "trash")
            }
        }
    }
}

private struct CampaignStatusRow: View {
    let status: CampaignStatus
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
    let campaign = PersistedCampaignRecord(campaign: SampleData.campaigns[0])
    return NavigationStack {
        CampaignDetailView(sessionStore: LocalSessionStore(), campaign: campaign)
    }
    .modelContainer(for: PersistedCampaignRecord.self, inMemory: true)
}
