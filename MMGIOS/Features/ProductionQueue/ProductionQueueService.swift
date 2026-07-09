import Foundation

struct ProductionQueueService {
    func createQueueItem(for task: TaskRecord, workflow: WorkflowRecord, position: Int = 0) -> ProductionQueueRecord {
        ProductionQueueRecord(
            workflowID: workflow.id,
            taskID: task.id,
            lane: lane(for: task),
            status: .ready,
            priority: priority(from: task.priority),
            position: position,
            summary: task.title
        )
    }

    func activate(_ item: ProductionQueueRecord) {
        item.status = ProductionQueueStatus.active.rawValue
        item.updatedAt = .now
    }

    func block(_ item: ProductionQueueRecord, reason: String) {
        item.status = ProductionQueueStatus.blocked.rawValue
        item.blocker = reason
        item.updatedAt = .now
    }

    func complete(_ item: ProductionQueueRecord) {
        item.status = ProductionQueueStatus.completed.rawValue
        item.blocker = ""
        item.updatedAt = .now
    }

    private func priority(from value: String) -> ProductionTaskPriority {
        ProductionTaskPriority(rawValue: value) ?? .normal
    }

    private func lane(for task: TaskRecord) -> ProductionQueueLane {
        if task.department == ProductionDepartment.editorial.rawValue { return .editorial }
        if task.department == ProductionDepartment.design.rawValue { return .design }
        if task.department == ProductionDepartment.publishing.rawValue { return .publishing }
        if task.department == ProductionDepartment.marketing.rawValue { return .marketing }
        if task.department == ProductionDepartment.customerSuccess.rawValue { return .delivery }
        if task.status == ProductionTaskStatus.waitingForApproval.rawValue { return .approvals }
        return .intake
    }
}
