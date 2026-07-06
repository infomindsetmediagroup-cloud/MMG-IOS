import SwiftUI

struct CampaignDetailView: View {
    let campaignStore: LocalCampaignStore
    let sessionStore: LocalSessionStore
    let campaign: Campaign

    private var currentCampaign: Campaign {
        campaignStore.campaigns.first(where: { $0.id == campaign.id }) ?? campaign
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(currentCampaign.channel.rawValue.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.mmgBlue)
                        .tracking(1.2)

                    Text(currentCampaign.title)
                        .font(.largeTitle.bold())

                    Text(currentCampaign.objective)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Campaign") {
                LabeledContent("Status", value: currentCampaign.status.rawValue)
                LabeledContent("Audience", value: currentCampaign.audience.rawValue)
                LabeledContent("Offer", value: currentCampaign.offer)
                LabeledContent("Landing Page", value: currentCampaign.landingPagePath)
                LabeledContent("Can Launch", value: currentCampaign.canLaunch ? "Yes" : "No")
            }

            if let promo = currentCampaign.promoCode {
                Section("Promo Code") {
                    LabeledContent("Code", value: promo.code)
                    LabeledContent("Discount", value: promo.discountDescription)
                    LabeledContent("Active", value: promo.isActive ? "Yes" : "No")

                    Button {
                        campaignStore.togglePromo(campaignID: currentCampaign.id)
                    } label: {
                        Label(promo.isActive ? "Deactivate Promo" : "Activate Promo", systemImage: "tag")
                    }
                }
            }

            Section("Approval") {
                if let approvedBy = currentCampaign.approvedBy {
                    LabeledContent("Approved By", value: approvedBy)
                } else {
                    Button {
                        campaignStore.approve(campaignID: currentCampaign.id, approver: sessionStore.session.user.name)
                    } label: {
                        Label("Approve Campaign", systemImage: "hand.thumbsup")
                    }
                }
            }

            Section("Status") {
                ForEach(CampaignStatus.allCases) { status in
                    Button {
                        campaignStore.updateStatus(campaignID: currentCampaign.id, status: status)
                    } label: {
                        HStack {
                            Text(status.rawValue)
                            Spacer()
                            if currentCampaign.status == status {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.mmgBlue)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Campaign")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        CampaignDetailView(campaignStore: LocalCampaignStore(), sessionStore: LocalSessionStore(), campaign: SampleData.campaigns[0])
    }
}
