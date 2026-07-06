import SwiftUI

struct CampaignEditorView: View {
    let campaignStore: LocalCampaignStore
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var status: CampaignStatus = .draft
    @State private var channel: CampaignChannel = .email
    @State private var audience: AudienceSegment = .newCreators
    @State private var objective = ""
    @State private var offer = ""
    @State private var landingPagePath = ""
    @State private var requiresApproval = true

    var body: some View {
        NavigationStack {
            Form {
                Section("Campaign") {
                    TextField("Title", text: $title)
                    TextField("Objective", text: $objective, axis: .vertical)
                        .lineLimit(3, reservesSpace: true)
                    TextField("Offer", text: $offer, axis: .vertical)
                        .lineLimit(2, reservesSpace: true)
                    TextField("Landing Page", text: $landingPagePath)
                }

                Section("Targeting") {
                    Picker("Channel", selection: $channel) {
                        ForEach(CampaignChannel.allCases) { channel in
                            Text(channel.rawValue).tag(channel)
                        }
                    }

                    Picker("Audience", selection: $audience) {
                        ForEach(AudienceSegment.allCases) { audience in
                            Text(audience.rawValue).tag(audience)
                        }
                    }

                    Picker("Status", selection: $status) {
                        ForEach(CampaignStatus.allCases) { status in
                            Text(status.rawValue).tag(status)
                        }
                    }

                    Toggle("Requires Approval", isOn: $requiresApproval)
                }
            }
            .navigationTitle("New Campaign")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveCampaign() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !objective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !offer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !landingPagePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func saveCampaign() {
        campaignStore.add(
            Campaign(
                title: title,
                status: status,
                channel: channel,
                audience: audience,
                objective: objective,
                offer: offer,
                landingPagePath: landingPagePath,
                requiresApproval: requiresApproval
            )
        )
        dismiss()
    }
}

#Preview {
    CampaignEditorView(campaignStore: LocalCampaignStore())
}
