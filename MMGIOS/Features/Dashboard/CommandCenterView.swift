import SwiftUI

struct CommandCenterView: View {
    private let columns = [GridItem(.adaptive(minimum: 160), spacing: 14)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    SectionHeader(
                        eyebrow: AppTheme.companyName,
                        title: "Kairos Command Center",
                        bodyText: "A connected operating layer for MMG publishing, production, customer operations, quality control, growth, and release execution."
                    )

                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(CommandCenterRegistry.metrics) { metric in
                            MetricCard(metric: metric)
                        }
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Text("Foundational Centers")
                            .font(.title2.bold())

                        ForEach(CommandCenterRegistry.commandCenters) { center in
                            CommandCenterCard(center: center)
                        }
                    }
                }
                .padding(20)
            }
            .background(
                LinearGradient(
                    colors: [Color.white, Color.mmgSurface],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .navigationTitle("Kairos")
        }
    }
}

#Preview {
    CommandCenterView()
}
