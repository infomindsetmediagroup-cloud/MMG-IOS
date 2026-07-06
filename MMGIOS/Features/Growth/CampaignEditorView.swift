import SwiftData
import SwiftUI

struct CampaignEditorView: View {
    @Environment(\.modelContext) private var modelContext
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
                campaignSection
                targetingSection
            }
            .navigationTitle("New Campaign")
            .toolbar { toolbarContent }
        }
    }

    private var campaignSection: some View {
        Section("Campaign") {
            TextField("Title", text: $title)
            TextField("Objective", text: $objective, axis: .vertical)
                .lineLimit(3, reservesSpace: true)
            TextField("Offer", text: $offer, axis: .vertical)
                .lineLimit(2, reservesSpace: true)
            TextField("Landing Page", text: $landingPagePath)
        }
    }

    private var targetingSection: some View {
        Section("Targeting") {
            channelPicker
            audiencePicker
            statusPicker
            Toggle("Requires Approval", isOn: $requiresApproval)
        }
    }

    private var channelPicker: some View {
        Picker("Channel", selection: $channel) {
            ForEach(CampaignChannel.allCases) { channel in
                Text(channel.rawValue).tag(channel)
            }
        }
    }

    private var audiencePicker: some View {
        Picker("Audience", selection: $audience) {
            ForEach(AudienceSegment.allCases) { audience in
                Text(audience.rawValue).tag(audience)
            }
        }
    }

    private var statusPicker: some View {
        Picker("Status", selection: $status) {
            ForEach(CampaignStatus.allCases) { status in
                Text(status.rawValue).tag(status)
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { dismiss() }
        }

        ToolbarItem(placement: .confirmationAction) {
            Button("Save") { saveCampaign() }
                .disabled(!canSave)
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !objective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !offer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !landingPagePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func saveCampaign() {
        let campaign = Campaign(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            status: status,
            channel: channel,
            audience: audience,
            objective: objective.trimmingCharacters(in: .whitespacesAndNewlines),
            offer: offer.trimmingCharacters(in: .whitespacesAndNewlines),
            landingPagePath: landingPagePath.trimmingCharacters(in: .whitespacesAndNewlines),
            requiresApproval: requiresApproval
        )

        modelContext.insert(PersistedCampaignRecord(campaign: campaign))
        dismiss()
    }
}

#Preview {
    CampaignEditorView()
        .modelContainer(for: PersistedCampaignRecord.self, inMemory: true)
}
