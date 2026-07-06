import Foundation
import Observation

@Observable
final class LocalSessionStore {
    private let storageKey = "kairos.auth.session.v1"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var session: AuthSession = .signedOut

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        load()
    }

    var isAuthenticated: Bool {
        session.isAuthenticated
    }

    func signIn(name: String, email: String, role: UserRole) {
        let user = KairosUser(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            role: role,
            lastAuthenticatedAt: Date()
        )

        session = AuthSession(user: user, isAuthenticated: true, createdAt: Date())
        save()
    }

    func signOut() {
        session = .signedOut
        save()
    }

    func save() {
        do {
            let data = try encoder.encode(session)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            assertionFailure("Failed to save auth session: \(error.localizedDescription)")
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }

        do {
            session = try decoder.decode(AuthSession.self, from: data)
        } catch {
            session = .signedOut
        }
    }
}
