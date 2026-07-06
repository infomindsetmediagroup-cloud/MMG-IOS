import SwiftUI

struct LoginView: View {
    let sessionStore: LocalSessionStore

    @State private var name = "Michael King"
    @State private var email = "info@mindsetmediagroup.com"
    @State private var role: UserRole = .owner

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Spacer()

                VStack(spacing: 12) {
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 56, weight: .semibold))
                        .foregroundStyle(.mmgBlue)

                    Text("Kairos")
                        .font(.largeTitle.bold())

                    Text("Secure operating access for Mindset Media Group™.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 14) {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                        .textInputAutocapitalization(.words)
                        .padding(14)
                        .background(Color.mmgSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(14)
                        .background(Color.mmgSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                    Picker("Role", selection: $role) {
                        ForEach(UserRole.allCases) { role in
                            Text(role.rawValue).tag(role)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Button {
                    sessionStore.signIn(name: name, email: email, role: role)
                } label: {
                    Text("Enter Command Center")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.mmgBlue, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .foregroundStyle(.white)
                }
                .disabled(!canSignIn)

                Spacer()
            }
            .padding(24)
            .background(
                LinearGradient(
                    colors: [Color.white, Color.mmgSurface],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
    }

    private var canSignIn: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

#Preview {
    LoginView(sessionStore: LocalSessionStore())
}
