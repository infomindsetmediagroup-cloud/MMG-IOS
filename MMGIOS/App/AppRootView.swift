import SwiftData
import SwiftUI

struct AppRootView: View {
    var body: some View {
        TabView {
            CommandCenterRuntimeSummaryView()
                .tabItem {
                    Label("Command", systemImage: "square.grid.2x2")
                }

            WorkflowRuntimeDashboardView()
                .tabItem {
                    Label("Workflow", systemImage: "point.3.connected.trianglepath.dotted")
                }

            DesignStudioWorkflowView()
                .tabItem {
                    Label("Studio", systemImage: "paintbrush.pointed")
                }
        }
        .tint(.mmgBlue)
    }
}

#Preview("Runtime Shell") {
    AppRootView()
        .modelContainer(for: [
            WorkflowRecord.self,
            WorkflowTransitionRecord.self,
            TaskRecord.self,
            TaskDependencyRecord.self,
            ProductionQueueRecord.self,
            DesignStudioProjectRecord.self,
            KnowledgeVaultRecord.self
        ], inMemory: true)
}
