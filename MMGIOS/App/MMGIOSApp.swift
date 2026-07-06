import SwiftData
import SwiftUI

@main
struct MMGIOSApp: App {
    private let modelContainer: ModelContainer

    init() {
        do {
            modelContainer = try PersistenceContainerFactory.makeContainer()
        } catch {
            fatalError("Failed to initialize SwiftData model container: \(error.localizedDescription)")
        }
    }

    var body: some Scene {
        WindowGroup {
            AuthGateView()
        }
        .modelContainer(modelContainer)
    }
}
