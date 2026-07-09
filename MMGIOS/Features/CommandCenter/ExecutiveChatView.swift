import SwiftUI

struct ExecutiveChatView: View {
    @State private var draftMessage = ""
    @State private var messages: [ExecutiveChatMessage] = ExecutiveChatMessage.seedMessages

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            commandBriefingCard

                            ForEach(messages) { message in
                                executiveMessageBubble(message)
                                    .id(message.id)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 18)
                    }
                    .background(Color.mmgBackground)
                    .onChange(of: messages.count) { _, _ in
                        if let lastID = messages.last?.id {
                            withAnimation(.snappy) {
                                proxy.scrollTo(lastID, anchor: .bottom)
                            }
                        }
                    }
                }

                Divider()

                composer
                    .padding(12)
                    .background(.regularMaterial)
            }
            .navigationTitle("Kairos Chat")
        }
    }

    private var commandBriefingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Executive command interface", systemImage: "sparkles")
                .font(.headline)
                .foregroundStyle(.mmgBlue)

            Text("Use this surface to direct Kairos in plain language. The first implementation stores local session messages and prepares the interface for backend routing, department orchestration, and approval-aware execution.")
                .font(.callout)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 6) {
                Text("Suggested commands")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("• Show everything waiting for approval")
                Text("• Create the next production slice")
                Text("• Summarize active customer releases")
                Text("• Route this request to the right department")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.mmgBlue.opacity(0.14), lineWidth: 1)
        )
    }

    private func executiveMessageBubble(_ message: ExecutiveChatMessage) -> some View {
        HStack(alignment: .bottom) {
            if message.role == .user {
                Spacer(minLength: 42)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(message.role.label)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(message.role == .user ? .white.opacity(0.76) : .mmgBlue)

                Text(message.body)
                    .font(.callout)
                    .foregroundStyle(message.role == .user ? .white : .primary)
                    .textSelection(.enabled)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(message.role == .user ? Color.mmgBlue : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(message.role == .user ? Color.clear : Color.mmgBlue.opacity(0.10), lineWidth: 1)
            )

            if message.role == .kairos {
                Spacer(minLength: 42)
            }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Direct Kairos...", text: $draftMessage, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .background(Color.mmgSurface)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            Button(action: sendMessage) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .secondary : .mmgBlue)
            }
            .disabled(draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("Send message to Kairos")
        }
    }

    private func sendMessage() {
        let trimmed = draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        messages.append(.init(role: .user, body: trimmed))
        draftMessage = ""

        messages.append(.init(role: .kairos, body: localKairosResponse(for: trimmed)))
    }

    private func localKairosResponse(for command: String) -> String {
        let lowercased = command.lowercased()

        if lowercased.contains("approval") {
            return "I would route this to the approval queue, summarize blocked dependencies, and surface the oldest executive decision first. Backend execution wiring comes in the next runtime slice."
        }

        if lowercased.contains("department") || lowercased.contains("route") {
            return "I would classify the request, select the responsible Kairos department, preserve the decision path, and return a traceable execution plan."
        }

        if lowercased.contains("release") || lowercased.contains("publish") {
            return "I would inspect release gates, approved deliverables, asset readiness, and customer portal eligibility before recommending publication."
        }

        if lowercased.contains("slice") || lowercased.contains("build") {
            return "I would convert that direction into a scoped implementation slice with files, acceptance criteria, validation steps, and a draft PR plan."
        }

        return "Command received. This local chat foundation is ready for backend routing, department orchestration, memory capture, and approval-aware execution in the next slice."
    }
}

private struct ExecutiveChatMessage: Identifiable, Equatable {
    let id = UUID()
    let role: ExecutiveChatRole
    let body: String

    static let seedMessages: [ExecutiveChatMessage] = [
        .init(role: .kairos, body: "Executive channel online. Tell me what to build, review, route, publish, or organize next."),
        .init(role: .user, body: "Show me what deserves attention today."),
        .init(role: .kairos, body: "I will prioritize blockers, approvals, customer release gates, review assets, and open execution queues before recommending the next action.")
    ]
}

private enum ExecutiveChatRole: Equatable {
    case kairos
    case user

    var label: String {
        switch self {
        case .kairos:
            return "Kairos"
        case .user:
            return "Executive"
        }
    }
}

#Preview {
    ExecutiveChatView()
}
