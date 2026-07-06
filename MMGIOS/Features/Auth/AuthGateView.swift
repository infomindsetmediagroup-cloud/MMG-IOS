import SwiftUI

struct AuthGateView: View {
    @State private var sessionStore = LocalSessionStore()

    var body: some View {
        Group {
            if sessionStore.isAuthenticated {
                AppRootView(sessionStore: sessionStore)
            } else {
                LoginView(sessionStore: sessionStore)
            }
        }
    }
}

#Preview {
    AuthGateView()
}
