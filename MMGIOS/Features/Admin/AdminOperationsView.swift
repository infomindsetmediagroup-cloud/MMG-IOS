import SwiftUI

struct AdminOperationsView: View {
    private let doctrineRows = [
        ("Portal-first operating model", "person.2.crop.square.stack"),
        ("Clean canonical public URLs", "link"),
        ("Production-ready vertical slices", "square.stack.3d.up"),
        ("Human approval before external campaign launch", "hand.raised")
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

                Section("Current Doctrine") {
                    ForEach(doctrineRows, id: \.0) { row in
                        Label(row.0, systemImage: row.1)
                    }
                }
            }
            .navigationTitle("Admin")
        }
    }
}

#Preview {
    AdminOperationsView()
}
