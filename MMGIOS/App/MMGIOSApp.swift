import SwiftData
import SwiftUI

@main
struct MMGIOSApp: App {
    private let modelContainer: ModelContainer
    @Environment(\.scenePhase) private var scenePhase
    @State private var kairosRuntime = LocalKairosRuntimeStore.restore()

    init() {
        do {
            modelContainer = try PersistenceContainerFactory.makeContainer()
        } catch {
            preconditionFailure("SwiftData model container initialization failed")
        }
    }

    var body: some Scene {
        WindowGroup {
            AuthGateView()
                .environment(kairosRuntime)
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase != .active {
                        LocalKairosRuntimeStore.save(kairosRuntime)
                    }
                }
        }
        .modelContainer(modelContainer)
    }
}
