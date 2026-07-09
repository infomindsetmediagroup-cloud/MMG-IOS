import SwiftData
import SwiftUI

struct CustomerPortalView: View {
    let sessionStore: LocalSessionStore
    let customerStore: LocalCustomerPortalStore

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PersistedCustomerRequestRecord.updatedAt, order: .reverse) private var requests: [PersistedCustomerRequestRecord]
    @Query(sort: \PersistedValueDiscoveryProfile.updatedAt, order: .reverse) private var valueProfiles: [PersistedValueDiscoveryProfile]
    @Query(sort: \CustomerReleaseRecord.updatedAt, order: .reverse) private var customerReleases: [CustomerReleaseRecord]
    @Query(sort: \CustomerPortalNotificationRecord.createdAt, order: .reverse) private var notifications: [CustomerPortalNotificationRecord]
    @State private var showingNewRequest = false
    @State private var knowledgeExpertise = ""
    @State private var skills = ""
    @State private var professionalExperience = ""
    @State private var lifeExperience = ""
    @State private var interests = ""
    @State private var desiredOutcomes = ""
    @State private var saveMessage = ""

    private let deliveryBuilder = CustomerDeliverablesLibraryBuilder()

    private var openRequests: [PersistedCustomerRequestRecord] {
        requests.filter { $0.statusRawValue != CustomerRequestStatus.complete.rawValue }
    }

    private var publishedReleases: [CustomerReleaseRecord] {
        deliveryBuilder.visiblePublishedReleases(from: customerReleases)
    }

    private var approvedPendingReleases: [CustomerReleaseRecord] {
        customerReleases.filter { $0.status == CustomerReleaseStatus.approved.rawValue }
    }

    private var unreadNotifications: [CustomerPortalNotificationRecord] {
        deliveryBuilder.unreadNotifications(from: notifications)
    }

    private var deliveryGroups: [CustomerDeliverableProjectGroup] {
        deliveryBuilder.projectGroups(from: customerReleases)
    }

    private var releaseTimeline: [CustomerReleaseTimelineEvent] {
        Array(deliveryBuilder.timeline(from: customerReleases).prefix(8))
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
                notificationsSection
                deliverablesLibrarySection
                releaseTimelineSection
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
                seedPublicationNotificationsIfNeeded()
                loadValueDiscoveryProfile()
            }
            .onChange(of: valueProfiles.count) { _, _ in loadValueDiscoveryProfile() }
            .onChange(of: publishedReleases.count) { _, _ in seedPublicationNotificationsIfNeeded() }
        }
    }

    private var headerSection: some View {
        Section {
            SectionHeader(
                eyebrow: "Your Knowledge Has Value",
                title: "Customer Portal",
                bodyText: "Customer-facing intake, Value Discovery, service onboarding, file-submission routing, support requests, and controlled final deliverable access."
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
            LabeledContent("Published releases", value: "\(publishedReleases.count)")
            LabeledContent("Unread updates", value: "\(unreadNotifications.count)")
            LabeledContent("Approved pending release", value: "\(approvedPendingReleases.count)")
            Label("Canonical service onboarding enabled", systemImage: "checkmark.seal")
        }
    }

    private var notificationsSection: some View {
        Section("Customer Notifications") {
            if unreadNotifications.isEmpty {
                Text("No unread delivery notifications.")
                    .foregroundStyle(.secondary)
            } else {
                Button("Mark all delivery updates read") { markAllNotificationsRead() }
                ForEach(unreadNotifications) { notification in
                    Button { markNotificationRead(notification) } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(notification.title).font(.headline)
                            Text(notification.message)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("\(notification.kind) • \(notification.createdAt.formatted(date: .abbreviated, time: .shortened))")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var deliverablesLibrarySection: some View {
        Section("Deliverables Library") {
            if deliveryGroups.isEmpty {
                Text("No final deliverables have been published to the customer portal yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(deliveryGroups) { group in
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Project \(group.projectID)")
                            .font(.headline)
                        Text("\(group.releases.count) published version\(group.releases.count == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        ForEach(group.releases) { release in
                            let package = deliveryBuilder.package(for: release)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(package.title) • \(package.versionLabel)")
                                    .font(.subheadline.weight(.semibold))
                                Text(package.releaseNotes)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text(package.approvalSummary)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text("Gate report: \(package.gateSummary)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text("Controlled access: \(package.controlledAccessLocation)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
    }

    private var releaseTimelineSection: some View {
        Section("Release Timeline") {
            if releaseTimeline.isEmpty {
                Text("Release audit events will appear after approval and publication.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(releaseTimeline) { event in
                    VStack(alignment: .leading, spacing: 5) {
                        Text("\(event.event): \(event.title)").font(.subheadline)
                        Text(event.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(event.occurredAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
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

    private func seedPublicationNotificationsIfNeeded() {
        var insertedNotification = false

        for release in publishedReleases where !deliveryBuilder.hasPublicationNotification(for: release, in: notifications) {
            modelContext.insert(deliveryBuilder.makePublicationNotification(for: release))
            insertedNotification = true
        }

        if insertedNotification { try? modelContext.save() }
    }

    private func markNotificationRead(_ notification: CustomerPortalNotificationRecord) {
        deliveryBuilder.markRead(notification)
        try? modelContext.save()
    }

    private func markAllNotificationsRead() {
        for notification in unreadNotifications {
            deliveryBuilder.markRead(notification)
        }
        try? modelContext.save()
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
            CustomerReleaseRecord.self,
            CustomerPortalNotificationRecord.self
        ], inMemory: true)
}