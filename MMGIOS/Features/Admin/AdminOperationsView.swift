import SwiftUI

struct AdminOperationsView: View {
    private let tasks = [
        "Navigation and critical-link validation",
        "Customer portal intake review",
        "Publishing standard enforcement",
        "Service-product backlog execution",
        "Release readiness checkpointing"
    ]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SectionHeader(
                        eyebrow: "Internal Workspace",
                        title: "Admin Operations",
                        bodyText: "Centralized control for MMG operating standards, task routing, customer workflow oversight, and system health."
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section("Operational Queue") {
                    ForEach(tasks, id: \.self) { task in
                        Label(task, systemImage: "checkmark.circle")
                    }
                }

                Section("Current Doctrine") {
                    Label("Portal-first operating model", systemImage: "person.2.crop.square.stack")
                    Label("Clean canonical public URLs", systemImage: "link")
                    Label("Production-ready vertical slices", systemImage: "square.stack.3d.up")
                    Label("Human approval before external campaign launch", systemImage: "hand.raised")
                }
            }
            .navigationTitle("Admin")
        }
    }
}

#Preview {
    AdminOperationsView()
}
