import SwiftData
import SwiftUI

@main
struct MMGIOSApp: App {
    private let modelContainer: ModelContainer
    @State private var kairosRuntime = KairosRuntime()

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
        }
        .modelContainer(modelContainer)
    }
}
