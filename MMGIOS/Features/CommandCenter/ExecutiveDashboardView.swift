import SwiftData
import SwiftUI

struct ExecutiveDashboardView: View {
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]
    @Query(sort: \ProductionAssetRecord.updatedAt, order: .reverse) private var assets: [ProductionAssetRecord]
    @Query(sort: \DeliverableRecord.updatedAt, order: .reverse) private var deliverables: [DeliverableRecord]
    @Query(sort: \CustomerReleaseRecord.updatedAt, order: .reverse) private var customerReleases: [CustomerReleaseRecord]
    @Query(sort: \KnowledgeVaultRecord.updatedAt, order: .reverse) private var knowledgeRecords: [KnowledgeVaultRecord]

    private let releaseGatePolicy = CustomerReleaseGatePolicy()

    private var activeWorkflows: [WorkflowRecord] {
        workflows.filter { $0.status == RuntimeWorkflowStatus.active.rawValue || $0.status == RuntimeWorkflowStatus.draft.rawValue }
    }

    private var approvalWorkflows: [WorkflowRecord] {
        workflows.filter { $0.status == RuntimeWorkflowStatus.waitingForApproval.rawValue }
    }

    private var openTasks: [TaskRecord] {
        tasks.filter { $0.status != ProductionTaskStatus.completed.rawValue && $0.status != ProductionTaskStatus.cancelled.rawValue }
    }

    private var blockedQueueItems: [ProductionQueueRecord] {
        queueItems.filter { $0.status == ProductionQueueStatus.blocked.rawValue }
    }

    private var executionPackages: [ExecutivePackageHealth] {
        workflows.compactMap { workflow in
            guard let task = tasks.first(where: { $0.workflowID == workflow.id }),
                  let queueItem = queueItems.first(where: { $0.taskID == task.id })
            else { return nil }

            return ExecutivePackageHealth(workflow: workflow, task: task, queueItem: queueItem)
        }
    }

    private var blockedPackages: [ExecutivePackageHealth] {
        executionPackages.filter { $0.state == .blocked }
    }

    private var activePackages: [ExecutivePackageHealth] {
        executionPackages.filter { $0.state == .active }
    }

    private var readyPackages: [ExecutivePackageHealth] {
        executionPackages.filter { $0.state == .ready }
    }

    private var completedPackages: [ExecutivePackageHealth] {
        executionPackages.filter { $0.state == .completed }
    }

    private var reviewAssets: [ProductionAssetRecord] {
        assets.filter { $0.status == ProductionAssetStatus.needsReview.rawValue }
    }

    private var publishReadyReleases: [CustomerReleaseRecord] {
        customerReleases.filter { releaseGatePolicy.canPublish($0) && $0.status != CustomerReleaseStatus.published.rawValue }
    }

    private var blockedReleases: [CustomerReleaseRecord] {
        customerReleases.filter {
            !releaseGatePolicy.canPublish($0) &&
            $0.status != CustomerReleaseStatus.published.rawValue &&
            $0.status != CustomerReleaseStatus.archived.rawValue
        }
    }

    private var routedActionRecords: [KnowledgeVaultRecord] {
        knowledgeRecords.filter { $0.projectContext.lowercased().contains("routed") }
    }

    private var openActionRecords: [KnowledgeVaultRecord] {
        routedActionRecords.filter { actionStatus(for: $0) != .completed }
    }

    private var inProgressActionRecords: [KnowledgeVaultRecord] {
        routedActionRecords.filter { actionStatus(for: $0) == .inProgress }
    }

    private var completedActionRecords: [KnowledgeVaultRecord] {
        routedActionRecords.filter { actionStatus(for: $0) == .completed }
    }

    private var highPriorityActionRecords: [KnowledgeVaultRecord] {
        openActionRecords.filter { ExecutiveActionPriority.from(record: $0) == .high }
    }

    private var executiveRecommendation: String {
        if !blockedReleases.isEmpty {
            return "Clear blocked customer release gates first. They prevent approved work from reaching the portal."
        }
        if !blockedPackages.isEmpty {
            return "Resolve blocked execution packages before opening new work. Workflow, task, and queue state are currently constrained."
        }
        if !highPriorityActionRecords.isEmpty {
            return "Review high-priority routed actions. Kairos detected approval, blocker, or gate-related work requiring executive attention."
        }
        if !activePackages.isEmpty {
            return "Continue active execution packages and close the oldest in-progress package before expanding production load."
        }
        if !approvalWorkflows.isEmpty {
            return "Review pending workflow approvals. Approval decisions unlock downstream production execution."
        }
        if !reviewAssets.isEmpty {
            return "Review production assets waiting for feedback so Design Studio work can move toward export."
        }
        if !publishReadyReleases.isEmpty {
            return "Publish ready customer releases through the controlled release gate."
        }
        if activeWorkflows.isEmpty && openTasks.isEmpty && openActionRecords.isEmpty {
            return "No critical operating blockers detected. Create or activate the next execution slice."
        }
        if !readyPackages.isEmpty {
            return "Start the oldest ready execution package so approved work begins moving through production."
        }
        if !openActionRecords.isEmpty {
            return "Continue clearing routed executive actions so chat decisions become completed operating movement."
        }
        return "Continue active workflow execution. Keep production movement focused on the oldest open task first."
    }

    private var priorityItems: [ExecutivePriorityItem] {
        var items: [ExecutivePriorityItem] = []

        if !blockedReleases.isEmpty {
            items.append(.init(title: "Release gates blocked", detail: "\(blockedReleases.count) customer release package needs attention.", systemImage: "shield.slash"))
        }
        if !blockedPackages.isEmpty {
            items.append(.init(title: "Execution packages blocked", detail: "\(blockedPackages.count) linked workflow package is blocked.", systemImage: "exclamationmark.octagon"))
        }
        if !highPriorityActionRecords.isEmpty {
            items.append(.init(title: "High-priority actions", detail: "\(highPriorityActionRecords.count) routed action needs executive attention.", systemImage: "tray.full"))
        }
        if !activePackages.isEmpty {
            items.append(.init(title: "Packages in execution", detail: "\(activePackages.count) linked package is actively moving.", systemImage: "play.circle"))
        }
        if !approvalWorkflows.isEmpty {
            items.append(.init(title: "Approvals waiting", detail: "\(approvalWorkflows.count) workflow decision is ready for executive review.", systemImage: "checkmark.seal"))
        }
        if !reviewAssets.isEmpty {
            items.append(.init(title: "Assets need review", detail: "\(reviewAssets.count) Design Studio asset requires feedback.", systemImage: "eye"))
        }
        if !publishReadyReleases.isEmpty {
            items.append(.init(title: "Ready to publish", detail: "\(publishReadyReleases.count) customer release can move to portal publication.", systemImage: "paperplane"))
        }
        if items.isEmpty && !readyPackages.isEmpty {
            items.append(.init(title: "Packages ready", detail: "\(readyPackages.count) approved execution package is ready to start.", systemImage: "bolt.circle"))
        }
        if items.isEmpty && !openActionRecords.isEmpty {
            items.append(.init(title: "Routed actions open", detail: "\(openActionRecords.count) Kairos-routed action is waiting in the Actions tab.", systemImage: "arrow.triangle.branch"))
        }
        if items.isEmpty {
            items.append(.init(title: "Execution clear", detail: "No urgent blockers detected in current local operating data.", systemImage: "checkmark.circle"))
        }

        return Array(items.prefix(5))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    executiveHeader
                }
                .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
                .listRowBackground(Color.clear)

                Section("Today's Priorities") {
                    ForEach(priorityItems) { item in
                        executivePriorityRow(item)
                    }
                }

                Section("Execution Package Health") {
                    metricRow(title: "Ready packages", value: readyPackages.count, systemImage: "bolt.circle")
                    metricRow(title: "Active packages", value: activePackages.count, systemImage: "play.circle")
                    metricRow(title: "Blocked packages", value: blockedPackages.count, systemImage: "exclamationmark.octagon")
                    metricRow(title: "Completed packages", value: completedPackages.count, systemImage: "checkmark.circle")
                }

                Section("Business Snapshot") {
                    metricRow(title: "Active workflows", value: activeWorkflows.count, systemImage: "play.circle")
                    metricRow(title: "Open tasks", value: openTasks.count, systemImage: "checklist")
                    metricRow(title: "Queue items", value: queueItems.count, systemImage: "tray.full")
                    metricRow(title: "Open routed actions", value: openActionRecords.count, systemImage: "arrow.triangle.branch")
                    metricRow(title: "In-progress actions", value: inProgressActionRecords.count, systemImage: "play.circle")
                    metricRow(title: "Completed actions", value: completedActionRecords.count, systemImage: "checkmark.circle")
                    metricRow(title: "High-priority actions", value: highPriorityActionRecords.count, systemImage: "exclamationmark.triangle")
                    metricRow(title: "Production assets", value: assets.count, systemImage: "shippingbox")
                    metricRow(title: "Deliverables", value: deliverables.count, systemImage: "doc.badge.gearshape")
                    metricRow(title: "Knowledge records", value: knowledgeRecords.count, systemImage: "books.vertical")
                }

                Section("Recent Execution Packages") {
                    if executionPackages.isEmpty {
                        Text("No execution packages yet. Approve a routed action and create its workflow package.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(executionPackages.prefix(5)) { package in
                            packageHealthRow(package)
                        }
                    }
                }

                Section("Recent Open Actions") {
                    if openActionRecords.isEmpty {
                        Text("No open routed actions. Send a Kairos Chat command to create the next operating item.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(openActionRecords.prefix(4)) { record in
                            routedActionRow(record)
                        }
                    }
                }

                Section("Project Movement") {
                    if activeWorkflows.isEmpty {
                        Text("No active workflows yet. Start the next execution slice from the Workflow tab.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(activeWorkflows.prefix(5)) { workflow in
                            projectMovementRow(workflow)
                        }
                    }
                }

                Section("Kairos Recommendation") {
                    Label {
                        Text(executiveRecommendation)
                            .font(.callout)
                            .foregroundStyle(.primary)
                    } icon: {
                        Image(systemName: "sparkles")
                            .foregroundStyle(.mmgBlue)
                    }
                }
            }
            .navigationTitle("Executive")
            .scrollContentBackground(.hidden)
            .background(Color.mmgBackground)
        }
    }

    private var executiveHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(AppTheme.companyName)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.mmgBlue)
                .textCase(.uppercase)

            Text("Good morning, Mike.")
                .font(.largeTitle.bold())
                .foregroundStyle(.mmgInk)

            Text("Kairos is watching approvals, execution packages, production blockers, release gates, routed actions, assets, deliverables, and institutional knowledge.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [.white, .mmgSurface], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.mmgBlue.opacity(0.16), lineWidth: 1))
    }

    private func executivePriorityRow(_ item: ExecutivePriorityItem) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title).font(.headline)
                Text(item.detail).font(.caption).foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: item.systemImage).foregroundStyle(.mmgBlue)
        }
    }

    private func metricRow(title: String, value: Int, systemImage: String) -> some View {
        Label {
            LabeledContent(title, value: "\(value)")
        } icon: {
            Image(systemName: systemImage).foregroundStyle(.mmgBlue)
        }
    }

    private func packageHealthRow(_ package: ExecutivePackageHealth) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(package.workflow.projectTitle)
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                Text(package.state.label)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(package.state.tint.opacity(0.12))
                    .foregroundStyle(package.state.tint)
                    .clipShape(Capsule())
            }
            Text("\(package.workflow.owner) • \(package.workflow.stage)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.mmgBlue)
            Text("Task: \(package.task.status) • Queue: \(package.queueItem.status) • \(package.queueItem.lane)")
                .font(.caption)
                .foregroundStyle(.secondary)
            if let blocker = package.blocker {
                Text("Blocked: \(blocker)")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
    }

    private func routedActionRow(_ record: KnowledgeVaultRecord) -> some View {
        let status = actionStatus(for: record)

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(record.projectContext.isEmpty ? "Routed action" : record.projectContext)
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                Text(status.label)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(status.tint.opacity(0.12))
                    .foregroundStyle(status.tint)
                    .clipShape(Capsule())
            }
            if let department = extractValue(prefix: "Department:", from: record.decisionHistory) {
                Text(department).font(.caption.weight(.semibold)).foregroundStyle(.mmgBlue)
            }
            if let summary = extractValue(prefix: "Summary:", from: record.decisionHistory) {
                Text(summary).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Text(record.updatedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private func projectMovementRow(_ workflow: WorkflowRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(workflow.projectTitle)
                .font(.headline)
            Text("\(workflow.status) • updated \(workflow.updatedAt.formatted(date: .abbreviated, time: .shortened))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func extractValue(prefix: String, from text: String) -> String? {
        text
            .components(separatedBy: .newlines)
            .first { $0.hasPrefix(prefix) }?
            .replacingOccurrences(of: prefix, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func actionStatus(for record: KnowledgeVaultRecord) -> ExecutiveActionState {
        ExecutiveActionState.from(record: record)
    }
}

private struct ExecutivePriorityItem: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let systemImage: String
}

private struct ExecutivePackageHealth: Identifiable {
    let workflow: WorkflowRecord
    let task: TaskRecord
    let queueItem: ProductionQueueRecord

    var id: String { workflow.id }

    var state: ExecutivePackageState {
        if task.status == ProductionTaskStatus.completed.rawValue &&
            queueItem.status == ProductionQueueStatus.completed.rawValue {
            return .completed
        }
        if task.status == ProductionTaskStatus.blocked.rawValue ||
            queueItem.status == ProductionQueueStatus.blocked.rawValue ||
            workflow.status == RuntimeWorkflowStatus.blocked.rawValue {
            return .blocked
        }
        if task.status == ProductionTaskStatus.inProgress.rawValue ||
            queueItem.status == ProductionQueueStatus.active.rawValue {
            return .active
        }
        return .ready
    }

    var blocker: String? {
        if !task.blocker.isEmpty { return task.blocker }
        if !queueItem.blocker.isEmpty { return queueItem.blocker }
        return nil
    }
}

private enum ExecutivePackageState {
    case ready
    case active
    case blocked
    case completed

    var label: String {
        switch self {
        case .ready: return "Ready"
        case .active: return "Active"
        case .blocked: return "Blocked"
        case .completed: return "Complete"
        }
    }

    var tint: Color {
        switch self {
        case .ready, .active: return .mmgBlue
        case .blocked: return .orange
        case .completed: return .green
        }
    }
}

#Preview {
    ExecutiveDashboardView()
        .modelContainer(for: [
            WorkflowRecord.self,
            WorkflowTransitionRecord.self,
            TaskRecord.self,
            TaskDependencyRecord.self,
            ProductionQueueRecord.self,
            DesignStudioProjectRecord.self,
            ProductionAssetRecord.self,
            DeliverableRecord.self,
            CustomerReleaseRecord.self,
            PersistedCustomerRequestRecord.self,
            PersistedValueDiscoveryProfile.self,
            KnowledgeVaultRecord.self
        ], inMemory: true)
}
