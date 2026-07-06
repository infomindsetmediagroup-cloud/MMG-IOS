import SwiftData
import SwiftUI

@main
struct MMGIOSApp: App {
    var body: some Scene {
        WindowGroup {
            AuthGateView()
        }
        .modelContainer(for: PersistedProjectRecord.self)
    }
}
