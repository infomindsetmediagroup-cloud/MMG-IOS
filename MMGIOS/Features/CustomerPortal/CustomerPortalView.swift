import SwiftData
import SwiftUI

struct CustomerPortalView: View {
    let sessionStore: LocalSessionStore
    let customerStore: LocalCustomerPortalStore

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedCustomerRequestRecord.updatedAt, order: .reverse) private var requests: [PersistedCustomerRequestRecord]
    @Query(sort: \PersistedValueDiscoveryProfile.updatedAt, order: .reverse) private var valueProfiles: [PersistedValueDiscoveryProfile]
    @State private var showingNewRequest = false
    @State private var knowledgeExpertise = ""
    @State private var skills = ""
    @State private var professionalExperience = ""
    @State private var lifeExperience = ""
    @State private var interests = ""
    @State private var desiredOutcomes = ""
    @State private var saveMessage = ""

    private var openRequests: [PersistedCustomerRequestRecord] {
        requests.filter { $0.statusRawValue != CustomerRequestStatus.complete.rawValue }
    }

    private var valueProfile: PersistedValueDiscoveryProfile? { valueProfiles.first }

    private var draftProfile: ValueDiscoveryDraftProfile {
        ValueDiscoveryDraftProfile(
            knowledgeExpertise: knowledgeExpertise,
            skills: skills,
            professionalExperience: professionalExperience,
            lifeExperience: lifeExperience,
            interests: interests,
            desiredOutcomes: desiredOutcomes
        )
    }

    private var hasDraftProfileInput: Bool {
        [knowledgeExpertise, skills, professionalExperience, lifeExperience, interests, desiredOutcomes]
            .contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private var displayedCompletionScore: Int {
        hasDraftProfileInput ? draftProfile.completionScore : (valueProfile?.completionScore ?? 0)
    }

    private var displayedRecommendations: [ValueDiscoveryRecommendation] {
        valueProfile?.recommendations ?? draftProfile.recommendations
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                portalStatusSection
                designStudioSection
                ValueDiscoveryProfileSection(
                    knowledgeExpertise: $knowledgeExpertise,
                    skills: $skills,
                    professionalExperience: $professionalExperience,
                    lifeExperience: $lifeExperience,
                    interests: $interests,
                    desiredOutcomes: $desiredOutcomes,
                    saveMessage: saveMessage,
                    onSave: saveValueDiscoveryProfile
                )
                recommendationsSection
                requestsSection
            }
            .navigationTitle("Customer")
            .toolbar { toolbarContent }
            .sheet(isPresented: $showingNewRequest) { CustomerRequestEditorView(sessionStore: sessionStore) }
            .task {
                seedRequestsIfNeeded()
                loadValueDiscoveryProfile()
            }
            .onChange(of: valueProfiles.count) { _, _ in loadValueDiscoveryProfile() }
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Your Knowledge Has Value",
                title: "Customer Portal",
                bodyText: "Customer-facing intake, Value Discovery, service onboarding, file-submission routing, support requests, and project handoff tracking."
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var portalStatusSection: some View {
        Section("Portal Status") {
            LabeledContent("Signed in as", value: sessionStore.session.user.name)
            LabeledContent("Open requests", value: "\(openRequests.count)")
            LabeledContent("Value Discovery", value: "\(displayedCompletionScore)%")
            Label("Canonical service onboarding enabled", systemImage: "checkmark.seal")
        }
    }

    private var designStudioSection: some View {
        Section("Design Studio") {
            NavigationLink {
                DesignStudioWorkspaceView()
            } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Open Creative Production Workspace")
                        .font(.headline)
                    Text("Design, edit, generate, manage, version, and export customer production assets after Command Center routing.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Label("Production-only asset doctrine active", systemImage: "lock.shield")
            Label("Projects, assets, versions, exports, permissions, and Kairos history are backend-ready", systemImage: "externaldrive.connected.to.line.below")
        }
    }

    private var recommendationsSection: some View {
        Section("Kairos Recommendations") {
            if valueProfile != nil || hasDraftProfileInput {
                ForEach(displayedRecommendations) { recommendation in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(recommendation.title).font(.headline)
                        Text("\(recommendation.lane) • \(recommendation.detail)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                Text("Save the Value Discovery profile to generate recommendations.")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var requestsSection: some View {
        Section("Requests") {
            if requests.isEmpty {
                Text("No customer requests yet.").foregroundStyle(.secondary)
            } else {
                ForEach(requests) { request in
                    NavigationLink {
                        CustomerRequestDetailView(request: request)
                    } label: {
                        CustomerRequestRow(request: request)
                    }
                }
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { showingNewRequest = true } label: {
                Label("New Request", systemImage: "plus")
            }
        }
    }

    private func seedRequestsIfNeeded() {
        guard requests.isEmpty else { return }
        for request in SampleData.customerRequests {
            modelContext.insert(PersistedCustomerRequestRecord(request: request))
        }
    }

    private func loadValueDiscoveryProfile() {
        guard let profile = valueProfile else { return }
        knowledgeExpertise = profile.knowledgeExpertise
        skills = profile.skills
        professionalExperience = profile.professionalExperience
        lifeExperience = profile.lifeExperience
        interests = profile.interests
        desiredOutcomes = profile.desiredOutcomes
    }

    private func saveValueDiscoveryProfile() {
        let profile = valueProfile ?? PersistedValueDiscoveryProfile()
        profile.knowledgeExpertise = knowledgeExpertise
        profile.skills = skills
        profile.professionalExperience = professionalExperience
        profile.lifeExperience = lifeExperience
        profile.interests = interests
        profile.desiredOutcomes = desiredOutcomes
        profile.updatedAt = .now

        if valueProfile == nil { modelContext.insert(profile) }

        do {
            try modelContext.save()
            saveMessage = "Value Discovery saved. Kairos recommendations refreshed."
        } catch {
            saveMessage = "Value Discovery could not be saved. Review the profile and try again."
        }
    }
}

private struct CustomerRequestRow: View {
    let request: PersistedCustomerRequestRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(request.subject).font(.headline)
            Text("\(request.requestTypeRawValue) • \(request.statusRawValue)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    CustomerPortalView(sessionStore: LocalSessionStore(), customerStore: LocalCustomerPortalStore())
        .modelContainer(for: [
            PersistedCustomerRequestRecord.self,
            PersistedValueDiscoveryProfile.self,
            PersistedDesignStudioProject.self,
            PersistedDesignStudioAsset.self,
            PersistedDesignStudioVersionRecord.self,
            PersistedDesignStudioExportJob.self,
            PersistedDesignStudioPermissionRecord.self
        ], inMemory: true)
}
