import SwiftData
import SwiftUI

struct ExecutiveChatView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var draftMessage = ""
    @State private var messages: [ExecutiveChatMessage] = ExecutiveChatMessage.seedMessages
    @State private var isSending = false
    @State private var lastFailedObjective: String?
    @State private var runtimeErrorMessage: String?
    @State private var requestTask: Task<Void, Never>?
    @State private var pendingApprovalRecord: KnowledgeVaultRecord?
    @State private var pendingObjective: String?
    @State private var pendingDepartment: KairosDepartment?
    @State private var approvalErrorMessage: String?
    @State private var actionExecutionTask: Task<Void, Never>?

    private let executionCoordinator = ExecutiveExecutionCoordinator()
    private let packageRuntime = ExecutionPackageRuntimeService()

    private let chatService: KairosChatService
    private let runtimeReadiness: KairosRuntimeReadiness

    init(runtime: (any KairosRuntimeServing)? = nil) {
        let resolvedRuntime = runtime ?? KairosRuntimeFactory.makeDefault()
        chatService = KairosChatService(runtime: resolvedRuntime)
        runtimeReadiness = resolvedRuntime.readiness
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            commandBriefingCard
                            runtimeReadinessCard

                            ForEach(messages) { message in
                                executiveMessageBubble(message)
                                    .id(message.id)
                            }

                            if pendingApprovalRecord != nil {
                                approvalCard
                            }

                            if isSending {
                                runtimeProgressCard
                            }

                            if let runtimeErrorMessage {
                                runtimeErrorCard(message: runtimeErrorMessage)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 18)
                    }
                    .background(Color.mmgBackground)
                    .onChange(of: messages.count) { _, _ in
                        scrollToLatest(using: proxy)
                    }
                    .onChange(of: isSending) { _, _ in
                        scrollToLatest(using: proxy)
                    }
                    .onChange(of: runtimeErrorMessage) { _, _ in
                        scrollToLatest(using: proxy)
                    }
                }

                Divider()

                composer
                    .padding(12)
                    .background(.regularMaterial)
            }
            .navigationTitle("Kairos Chat")
            .onDisappear {
                requestTask?.cancel()
                actionExecutionTask?.cancel()
            }
        }
    }

    private var commandBriefingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Executive command interface", systemImage: "sparkles")
                .font(.headline)
                .foregroundStyle(.mmgBlue)

            Text("Direct Kairos in plain language. Objectives are routed locally for governance context, sent to the secure Kairos backend, and recorded for institutional continuity.")
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

    private var runtimeReadinessCard: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: runtimeReadiness.isReady ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                .font(.title3)
                .foregroundStyle(runtimeReadiness.isReady ? Color.green : Color.orange)

            VStack(alignment: .leading, spacing: 4) {
                Text(runtimeReadiness.isReady ? "Kairos runtime ready" : "Kairos runtime unavailable")
                    .font(.callout.weight(.semibold))

                Text(runtimeReadiness.statusMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(runtimeReadiness.isReady ? Color.green.opacity(0.08) : Color.orange.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var runtimeProgressCard: some View {
        HStack(spacing: 12) {
            ProgressView()
            VStack(alignment: .leading, spacing: 3) {
                Text("Kairos is working")
                    .font(.callout.weight(.semibold))
                Text("Routing, reasoning, and preparing a governed response.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Cancel") {
                requestTask?.cancel()
            }
            .font(.caption.weight(.semibold))
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var approvalCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Action package ready", systemImage: "checkmark.seal")
                .font(.headline)
                .foregroundStyle(.mmgBlue)

            Text("One decision will preserve the approval and place this objective in the execution queue.")
                .font(.callout)
                .foregroundStyle(.secondary)

            Button("Approve & Execute") {
                approvePendingAction()
            }
            .buttonStyle(.borderedProminent)
            .tint(.mmgBlue)

            if let approvalErrorMessage {
                Text(approvalErrorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.mmgBlue.opacity(0.16)))
    }

    private func runtimeErrorCard(message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Kairos request incomplete", systemImage: "exclamationmark.triangle")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.orange)

            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)

            HStack {
                if lastFailedObjective != nil {
                    Button("Retry") {
                        retryLastObjective()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.mmgBlue)
                }

                Button("Dismiss") {
                    runtimeErrorMessage = nil
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
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

                if let metadata = message.metadata {
                    Text(metadata)
                        .font(.caption2.monospaced())
                        .foregroundStyle(message.role == .user ? .white.opacity(0.68) : .secondary)
                        .textSelection(.enabled)
                }
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
            TextField(runtimeReadiness.isReady ? "Direct Kairos..." : "Configure Kairos runtime to continue", text: $draftMessage, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .background(Color.mmgSurface)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .disabled(isSending || !runtimeReadiness.isReady)

            Button(action: sendMessage) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(canSend ? Color.mmgBlue : Color.secondary)
            }
            .disabled(!canSend)
            .accessibilityLabel("Send message to Kairos")
        }
    }

    private var canSend: Bool {
        runtimeReadiness.isReady && !isSending && !draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func sendMessage() {
        let trimmed = draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, runtimeReadiness.isReady else { return }

        messages.append(.init(role: .user, body: trimmed))
        draftMessage = ""
        execute(trimmed)
    }

    private func retryLastObjective() {
        guard let objective = lastFailedObjective, runtimeReadiness.isReady else { return }
        execute(objective)
    }

    private func execute(_ objective: String) {
        requestTask?.cancel()
        isSending = true
        runtimeErrorMessage = nil
        lastFailedObjective = nil

        requestTask = Task {
            do {
                let result = try await chatService.execute(objective)
                guard !Task.isCancelled else { return }

                await MainActor.run {
                    let response = result.runtimeResponse
                    let metadata = responseMetadata(for: response, decision: result.routeDecision)
                    messages.append(.init(role: .kairos, body: response.message, metadata: metadata))
                    pendingApprovalRecord = captureKnowledgeRecord(result: result)
                    pendingObjective = result.objective
                    pendingDepartment = result.routeDecision.department
                    isSending = false
                    requestTask = nil
                }
            } catch {
                guard !Task.isCancelled else {
                    await MainActor.run {
                        isSending = false
                        requestTask = nil
                    }
                    return
                }

                await MainActor.run {
                    lastFailedObjective = objective
                    runtimeErrorMessage = (error as? LocalizedError)?.errorDescription ?? "Kairos could not complete the request."
                    isSending = false
                    requestTask = nil
                }
            }
        }
    }

    private func responseMetadata(
        for response: KairosRuntimeResponse,
        decision: KairosRouteDecision
    ) -> String {
        var values = ["department=\(response.department ?? decision.department.rawValue)"]
        if let requestID = response.requestID {
            values.append("request=\(requestID)")
        }
        if let auditID = response.auditID {
            values.append("audit=\(auditID)")
        }
        return values.joined(separator: " • ")
    }

    private func captureKnowledgeRecord(result: KairosChatResult) -> KnowledgeVaultRecord? {
        let decision = result.routeDecision
        let response = result.runtimeResponse
        let confidencePercent = Int((decision.confidence * 100).rounded())
        let plan = decision.executionPlan.enumerated().map { index, step in
            "\(index + 1). \(step)"
        }.joined(separator: "\n")

        var history = [
            "Source: Kairos Chat",
            "Input: \(result.objective)",
            "Local department: \(decision.department.displayName)",
            "Routing confidence: \(confidencePercent)%",
            "Runtime department: \(response.department ?? "not returned")",
            "Runtime response: \(response.message)",
            "Plan:",
            plan,
            "Governance: \(decision.governanceNote)"
        ]

        if let requestID = response.requestID {
            history.append("Request ID: \(requestID)")
        }
        if let auditID = response.auditID {
            history.append("Audit ID: \(auditID)")
        }

        let record = KnowledgeVaultRecord(
            customerName: "MMG Executive",
            brandProfile: "Mindset Media Group and Kairos operating system",
            projectContext: "Kairos runtime routed to \(decision.department.displayName)",
            decisionHistory: history.joined(separator: "\n")
        )

        modelContext.insert(record)
        do {
            try modelContext.save()
            return record
        } catch {
            modelContext.rollback()
            runtimeErrorMessage = "Kairos responded, but the action package could not be preserved."
            return nil
        }
    }

    private func approvePendingAction() {
        guard let record = pendingApprovalRecord,
              let objective = pendingObjective,
              let department = pendingDepartment
        else { return }
        approvalErrorMessage = nil
        let package = executionCoordinator.approveAndQueue(record: record)
        modelContext.insert(package.workflow)
        modelContext.insert(package.task)
        modelContext.insert(package.queueItem)

        do {
            try modelContext.save()
            pendingApprovalRecord = nil
            pendingObjective = nil
            pendingDepartment = nil

            if department == .shopifyWebsite {
                executeShopifyAudit(objective: objective, record: record, package: package)
            } else {
                messages.append(.init(
                    role: .kairos,
                    body: "Approved. The action package is queued. Its status will change to Working only when an authorized execution adapter claims it."
                ))
            }
        } catch {
            modelContext.rollback()
            approvalErrorMessage = "Kairos could not queue the action. No partial execution was saved."
        }
    }

    private func executeShopifyAudit(
        objective: String,
        record: KnowledgeVaultRecord,
        package: ExecutiveExecutionPackage
    ) {
        let startTransitions = packageRuntime.start(
            workflow: package.workflow,
            task: package.task,
            queueItem: package.queueItem
        )
        startTransitions.forEach(modelContext.insert)
        appendHistory("Execution Adapter Claimed: shopify.homepage.audit", to: record)
        appendState(.inProgress, to: record)

        do {
            try modelContext.save()
        } catch {
            modelContext.rollback()
            approvalErrorMessage = "The Shopify adapter could not claim this action."
            return
        }

        messages.append(.init(role: .kairos, body: "Approved. I’m inspecting the live Shopify homepage now."))
        actionExecutionTask?.cancel()
        actionExecutionTask = Task {
            do {
                let result = try await chatService.executeApprovedShopifyAudit(objective: objective)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    let completionTransitions = packageRuntime.complete(
                        workflow: package.workflow,
                        task: package.task,
                        queueItem: package.queueItem
                    )
                    completionTransitions.forEach(modelContext.insert)
                    appendHistory(shopifyEvidenceSummary(result), to: record)
                    appendState(.completed, to: record)
                    do {
                        try modelContext.save()
                        messages.append(.init(
                            role: .kairos,
                            body: "Homepage inspection completed and preserved. Live theme: \(result.evidence.name). I verified \(result.evidence.homepageFiles.count) homepage-critical theme files."
                        ))
                    } catch {
                        modelContext.rollback()
                        runtimeErrorMessage = "The Shopify audit completed, but its evidence could not be preserved."
                    }
                    actionExecutionTask = nil
                }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    let message = (error as? LocalizedError)?.errorDescription ?? "The Shopify homepage audit failed."
                    packageRuntime.block(
                        workflow: package.workflow,
                        task: package.task,
                        queueItem: package.queueItem,
                        reason: message
                    )
                    appendHistory("Execution Adapter Blocked: \(message)", to: record)
                    appendState(.needsReview, to: record)
                    try? modelContext.save()
                    messages.append(.init(role: .kairos, body: message))
                    actionExecutionTask = nil
                }
            }
        }
    }

    private func shopifyEvidenceSummary(_ result: KairosActionResponse) -> String {
        [
            "Execution Completed: \(result.actionType)",
            "Action ID: \(result.actionID)",
            "Live Theme: \(result.evidence.name)",
            "Theme ID: \(result.evidence.themeID)",
            "Theme Role: \(result.evidence.role)",
            "Theme Updated: \(result.evidence.updatedAt)",
            "Homepage Files: \(result.evidence.homepageFiles.joined(separator: ", "))",
            "Completed At: \(result.completedAt)"
        ].joined(separator: "\n")
    }

    private func appendState(_ status: ExecutiveActionState, to record: KnowledgeVaultRecord) {
        let timestamp = Date().formatted(date: .abbreviated, time: .shortened)
        appendHistory("Action Status: \(status.label) @ \(timestamp)", to: record)
    }

    private func appendHistory(_ note: String, to record: KnowledgeVaultRecord) {
        record.decisionHistory = record.decisionHistory.isEmpty ? note : record.decisionHistory + "\n\n" + note
        record.updatedAt = .now
    }

    private func scrollToLatest(using proxy: ScrollViewProxy) {
        guard let lastID = messages.last?.id else { return }
        withAnimation(.snappy) {
            proxy.scrollTo(lastID, anchor: .bottom)
        }
    }
}

private struct ExecutiveChatMessage: Identifiable, Equatable {
    let id = UUID()
    let role: ExecutiveChatRole
    let body: String
    let metadata: String?

    init(role: ExecutiveChatRole, body: String, metadata: String? = nil) {
        self.role = role
        self.body = body
        self.metadata = metadata
    }

    static let seedMessages: [ExecutiveChatMessage] = [
        .init(role: .kairos, body: "Executive channel online. Tell me what to build, review, route, publish, or organize next."),
        .init(role: .user, body: "Show me what deserves attention today."),
        .init(role: .kairos, body: "Kairos runtime wiring is active. Production responses require a configured secure backend endpoint.")
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
    ExecutiveChatView(runtime: UnavailableKairosRuntime(error: .missingConfiguration))
        .modelContainer(for: [
            KnowledgeVaultRecord.self,
            WorkflowRecord.self,
            WorkflowTransitionRecord.self,
            TaskRecord.self,
            ProductionQueueRecord.self
        ], inMemory: true)
}
