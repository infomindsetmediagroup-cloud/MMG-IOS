import SwiftUI

struct GrowthMarketingView: View {
    private let capabilities = [
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

                Section("Campaign Capabilities") {
                    ForEach(capabilities, id: \.self) { capability in
                        Label(capability, systemImage: "megaphone")
                    }
                }
            }
            .navigationTitle("Growth")
        }
    }
}

#Preview {
    GrowthMarketingView()
}
