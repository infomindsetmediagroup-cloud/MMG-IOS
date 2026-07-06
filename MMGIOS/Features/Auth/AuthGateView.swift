import SwiftUI

struct AuthGateView: View {
    @State private var sessionStore = LocalSessionStore()
    @State private var hasCompletedLaunchExperience = false

    var body: some View {
        Group {
            if hasCompletedLaunchExperience {
                authenticatedContent
            } else {
                LaunchExperienceView {
                    withAnimation(.easeInOut(duration: 0.28)) {
                        hasCompletedLaunchExperience = true
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var authenticatedContent: some View {
        if sessionStore.isAuthenticated {
            AppRootView(sessionStore: sessionStore)
        } else {
            LoginView(sessionStore: sessionStore)
        }
    }
}

#Preview {
    AuthGateView()
}
