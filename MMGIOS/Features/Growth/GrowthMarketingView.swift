import SwiftUI

struct GrowthMarketingView: View {
    let projectStore: LocalProjectStore

    private var growthProjects: [KairosProject] {
        projectStore.projects(in: .growth)
    }

    private let campaigns = [
        "Campaign calendar",
        "Promotion registry",
        "Audience segmentation",
        "Email orchestration",
        "Landing page recommendations",
        "Cross-sell and upsell planning"
    ]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SectionHeader(
                        eyebrow: "Approval-Controlled Growth",
                        title: "Growth & Marketing",
                        bodyText: "Campaign planning, promotional operations, audience lifecycle work, and advertising recommendations with human approval before external launch."
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section("Growth Records") {
                    ForEach(growthProjects) { project in
                        NavigationLink {
                            ProjectDetailView(projectStore: projectStore, project: project)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(project.title)
                                    .font(.headline)
                                Text(project.summary)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                    }
                }

                Section("Campaign Capabilities") {
                    ForEach(campaigns, id: \.self) { campaign in
                        Label(campaign, systemImage: "megaphone")
                    }
                }
            }
            .navigationTitle("Growth")
        }
    }
}

#Preview {
    GrowthMarketingView(projectStore: LocalProjectStore())
}
