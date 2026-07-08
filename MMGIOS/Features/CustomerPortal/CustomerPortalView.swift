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

    private var valueProfile: PersistedValueDiscoveryProfile? {
        valueProfiles.first
    }

    private var displayedRecommendations: [ValueDiscoveryRecommendation] {
        valueProfile?.recommendations ?? PersistedValueDiscoveryProfile(
            knowledgeExpertise: knowledgeExpertise,
            skills: skills,
            professionalExperience: professionalExperience,
            lifeExperience: lifeExperience,
            interests: interests,
            desiredOutcomes: desiredOutcomes
        ).recommendations
    }

    var body: some View {
        NavigationStack {
            List {
                headerSection
                portalStatusSection
                valueDiscoverySection
                recommendationsSection
                requestsSection
            }
            .navigationTitle("Customer")
            .toolbar { toolbarContent }
            .sheet(isPresented: $showingNewRequest) {
                CustomerRequestEditorView(sessionStore: sessionStore)
            }
            .task {
                seedRequestsIfNeeded()
                loadValueDiscoveryProfile()
            }
            .onChange(of: valueProfiles.count) { _, _ in
                loadValueDiscoveryProfile()
            }
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
            LabeledContent("Value Discovery", value: "\(valueProfile?.completionScore ?? 0)%")
            Label("Canonical service onboarding enabled", systemImage: "checkmark.seal")
        }
    }

    private var valueDiscoverySection: some View {
        Section("Value Discovery") {
            Text("Capture the customer profile Kairos uses to recommend positioning, assets, audience paths, and next execution steps.")
                .font(.caption)
                .foregroundStyle(.secondary)

            TextField("Knowledge and expertise", text: $knowledgeExpertise, axis: .vertical)
            TextField("Skills", text: $skills, axis: .vertical)
            TextField("Professional experience", text: $professionalExperience, axis: .vertical)
            TextField("Life experience", text: $lifeExperience, axis: .vertical)
            TextField("Interests", text: $interests, axis: .vertical)
            TextField("Desired outcomes", text: $desiredOutcomes, axis: .vertical)

            Button {
                saveValueDiscoveryProfile()
            } label: {
                Label("Save Value Discovery", systemImage: "square.and.arrow.down")
            }

            if !saveMessage.isEmpty {
                Text(saveMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var recommendationsSection: some View {
        Section("Kairos Recommendations") {
            if valueProfile != nil || hasDraftProfileInput {
                ForEach(displayedRecommendations) { recommendation in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(recommendation.title)
                            .font(.headline)
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
                Text("No customer requests yet.")
                    .foregroundStyle(.secondary)
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
            Button {
                showingNewRequest = true
            } label: {
                Label("New Request", systemImage: "plus")
            }
        }
    }

    private var hasDraftProfileInput: Bool {
        [knowledgeExpertise, skills, professionalExperience, lifeExperience, interests, desiredOutcomes]
            .contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
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

        if valueProfile == nil {
            modelContext.insert(profile)
        }

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
            Text(request.subject)
                .font(.headline)
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
            PersistedValueDiscoveryProfile.self
        ], inMemory: true)
}
