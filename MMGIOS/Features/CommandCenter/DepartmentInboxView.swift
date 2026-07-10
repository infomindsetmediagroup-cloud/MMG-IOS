import SwiftData
import SwiftUI

struct DepartmentInboxView: View {
    @Query(sort: \WorkflowRecord.updatedAt, order: .reverse) private var workflows: [WorkflowRecord]
    @Query(sort: \TaskRecord.updatedAt, order: .reverse) private var tasks: [TaskRecord]
    @Query(sort: \ProductionQueueRecord.updatedAt, order: .reverse) private var queueItems: [ProductionQueueRecord]

    private var departments: [DepartmentInboxSummary] {
        let canonicalNames = [
            "Executive Office",
            "Workflow Runtime",
            "Publishing",
            "Design Studio",
            "Growth",
            "Release Operations",
            "Knowledge Management",
            "Engineering"
        ]

        return canonicalNames.map { departmentName in
            DepartmentInboxSummary(
                departmentName: departmentName,
                workflows: workflows.filter { normalized($0.owner) == normalized(departmentName) },
                allTasks: tasks,
                allQueueItems: queueItems
            )
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    inboxHeader
                }
                .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
                .listRowBackground(Color.clear)

                Section("Department Load") {
                    ForEach(departments) { department in
                        NavigationLink {
                            DepartmentInboxDetailView(department: department)
                        } label: {
                            departmentRow(department)
                        }
                    }
                }
            }
            .navigationTitle("Departments")
            .scrollContentBackground(.hidden)
            .background(Color.mmgBackground)
        }
    }

    private var inboxHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Department Inboxes")
                .font(.largeTitle.bold())
                .foregroundStyle(.mmgInk)

            Text("See department ownership, execution-package health, active load, blockers, and completed operating movement.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [.white, .mmgSurface], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.mmgBlue.opacity(0.16), lineWidth: 1)
        )
    }

    private func departmentRow(_ department: DepartmentInboxSummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(department.departmentName)
                    .font(.headline)
                Spacer()
                Text(department.healthLabel)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(department.healthTint.opacity(0.12))
                    .foregroundStyle(department.healthTint)
                    .clipShape(Capsule())
            }

            HStack(spacing: 14) {
                metricLabel("Ready", value: department.readyPackageCount)
                metricLabel("Active", value: department.activePackageCount)
                metricLabel("Blocked", value: department.blockedPackageCount)
                metricLabel("Complete", value: department.completedPackageCount)
            }

            if let blocker = department.primaryBlocker {
                Text("Blocked: \(blocker)")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 5)
    }

    private func metricLabel(_ title: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(.headline)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func normalized(_ value: String) -> String {
        value
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "-", with: "")
            .lowercased()
    }
}

private struct DepartmentInboxDetailView: View {
    let department: DepartmentInboxSummary

    var body: some View {
        List {
            Section("Department") {
                LabeledContent("Name", value: department.departmentName)
                LabeledContent("Ready packages", value: "\(department.readyPackageCount)")
                LabeledContent("Active packages", value: "\(department.activePackageCount)")
                LabeledContent("Blocked packages", value: "\(department.blockedPackageCount)")
                LabeledContent("Completed packages", value: "\(department.completedPackageCount)")
                LabeledContent("Open tasks", value: "\(department.openTaskCount)")
                LabeledContent("Open queue items", value: "\(department.openQueueCount)")
            }

            Section("Execution Packages") {
                if department.packages.isEmpty {
                    Text("No complete workflow/task/queue packages are assigned to this department.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(department.packages) { package in
                        packageRow(package)
                    }
                }
            }

            Section("Unpackaged Workflows") {
                let unpackaged = department.workflows.filter { workflow in
                    !department.packages.contains { $0.workflow.id == workflow.id }
                }

                if unpackaged.isEmpty {
                    Text("Every assigned workflow has a linked task and queue item.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(unpackaged) { workflow in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(workflow.projectTitle)
                                .font(.headline)
                            Text("\(workflow.stage) • \(workflow.status)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Label("Execution package incomplete", systemImage: "exclamationmark.triangle")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle(department.departmentName)
    }

    private func packageRow(_ package: ExecutionPackageHealth) -> some View {
        VStack(alignment: .leading, spacing: 7) {
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

            Text("Workflow: \(package.workflow.stage) • \(package.workflow.status)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("Task: \(package.task.status) • \(package.task.assignee)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("Queue: \(package.queueItem.status) • \(package.queueItem.lane) • Position \(package.queueItem.position)")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let blocker = package.blocker {
                Text("Blocked: \(blocker)")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .lineLimit(3)
            }

            Text(package.workflow.updatedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

private struct DepartmentInboxSummary: Identifiable {
    let departmentName: String
    let workflows: [WorkflowRecord]
    let allTasks: [TaskRecord]
    let allQueueItems: [ProductionQueueRecord]

    var id: String { departmentName }

    var packages: [ExecutionPackageHealth] {
        ExecutionPackageHealthPolicy.packages(
            workflows: workflows,
            tasks: allTasks,
            queueItems: allQueueItems
        )
    }

    private var workflowIDs: Set<String> {
        Set(workflows.map(\.id))
    }

    private var linkedTasks: [TaskRecord] {
        allTasks.filter { workflowIDs.contains($0.workflowID) }
    }

    private var taskIDs: Set<String> {
        Set(linkedTasks.map(\.id))
    }

    private var linkedQueueItems: [ProductionQueueRecord] {
        allQueueItems.filter { taskIDs.contains($0.taskID) }
    }

    var readyPackageCount: Int {
        packages.filter { $0.state == .ready }.count
    }

    var activePackageCount: Int {
        packages.filter { $0.state == .active }.count
    }

    var blockedPackageCount: Int {
        packages.filter { $0.state == .blocked }.count
    }

    var completedPackageCount: Int {
        packages.filter { $0.state == .completed }.count
    }

    var openTaskCount: Int {
        linkedTasks.filter {
            $0.status != ProductionTaskStatus.completed.rawValue &&
            $0.status != ProductionTaskStatus.cancelled.rawValue
        }.count
    }

    var openQueueCount: Int {
        linkedQueueItems.filter { $0.status != ProductionQueueStatus.completed.rawValue }.count
    }

    var primaryBlocker: String? {
        packages.first(where: { $0.state == .blocked })?.blocker
    }

    var healthLabel: String {
        if blockedPackageCount > 0 { return "Blocked" }
        if activePackageCount > 0 { return "Active" }
        if readyPackageCount > 0 { return "Ready" }
        if completedPackageCount > 0 { return "Complete" }
        return "Clear"
    }

    var healthTint: Color {
        if blockedPackageCount > 0 { return .orange }
        if activePackageCount > 0 || readyPackageCount > 0 { return .mmgBlue }
        if completedPackageCount > 0 { return .green }
        return .secondary
    }
}

#Preview {
    DepartmentInboxView()
        .modelContainer(for: [
            WorkflowRecord.self,
            TaskRecord.self,
            ProductionQueueRecord.self
        ], inMemory: true)
}
