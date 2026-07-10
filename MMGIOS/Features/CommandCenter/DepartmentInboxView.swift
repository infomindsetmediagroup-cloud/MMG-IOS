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

            Text("See where Kairos has routed work, which departments are active, and where workflows, tasks, or production queue items are accumulating.")
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
                metricLabel("Workflows", value: department.activeWorkflowCount)
                metricLabel("Tasks", value: department.openTaskCount)
                metricLabel("Queue", value: department.openQueueCount)
                metricLabel("Blocked", value: department.blockedCount)
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
                LabeledContent("Active workflows", value: "\(department.activeWorkflowCount)")
                LabeledContent("Open tasks", value: "\(department.openTaskCount)")
                LabeledContent("Open queue items", value: "\(department.openQueueCount)")
                LabeledContent("Blocked", value: "\(department.blockedCount)")
            }

            Section("Workflows") {
                if department.workflows.isEmpty {
                    Text("No workflows are currently assigned to this department.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(department.workflows) { workflow in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(workflow.projectTitle)
                                .font(.headline)
                            Text("\(workflow.stage) • \(workflow.status)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(workflow.updatedAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle(department.departmentName)
    }
}

private struct DepartmentInboxSummary: Identifiable {
    let departmentName: String
    let workflows: [WorkflowRecord]
    let allTasks: [TaskRecord]
    let allQueueItems: [ProductionQueueRecord]

    var id: String { departmentName }

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

    var activeWorkflowCount: Int {
        workflows.filter {
            $0.status != RuntimeWorkflowStatus.completed.rawValue &&
            $0.status != RuntimeWorkflowStatus.cancelled.rawValue
        }.count
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

    var blockedCount: Int {
        linkedQueueItems.filter { $0.status == ProductionQueueStatus.blocked.rawValue }.count
    }

    var healthLabel: String {
        if blockedCount > 0 { return "Blocked" }
        if activeWorkflowCount > 0 || openTaskCount > 0 || openQueueCount > 0 { return "Active" }
        return "Clear"
    }

    var healthTint: Color {
        if blockedCount > 0 { return .orange }
        if activeWorkflowCount > 0 || openTaskCount > 0 || openQueueCount > 0 { return .mmgBlue }
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
