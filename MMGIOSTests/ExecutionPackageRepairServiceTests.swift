import XCTest
@testable import MMGIOS

final class ExecutionPackageRepairServiceTests: XCTestCase {
    func testRepairMissingTasksCreatesOnlyMissingTasks() {
        let workflowA = makeWorkflow(title: "A")
        let workflowB = makeWorkflow(title: "B")
        let existingTask = TaskRuntimeService().createInitialTask(for: workflowA)

        let repaired = ExecutionPackageRepairService().repairMissingTasks(
            workflows: [workflowA, workflowB],
            tasks: [existingTask]
        )

        XCTAssertEqual(repaired.count, 1)
        XCTAssertEqual(repaired.first?.workflowID, workflowB.id)
    }

    func testRepairMissingQueueItemsCreatesOnlyMissingQueueItems() {
        let workflowA = makeWorkflow(title: "A")
        let workflowB = makeWorkflow(title: "B")
        let taskA = TaskRuntimeService().createInitialTask(for: workflowA)
        let taskB = TaskRuntimeService().createInitialTask(for: workflowB)
        let existingQueue = ProductionQueueService().createQueueItem(for: taskA, workflow: workflowA)

        let repaired = ExecutionPackageRepairService().repairMissingQueueItems(
            workflows: [workflowA, workflowB],
            tasks: [taskA, taskB],
            queueItems: [existingQueue]
        )

        XCTAssertEqual(repaired.count, 1)
        XCTAssertEqual(repaired.first?.taskID, taskB.id)
        XCTAssertEqual(repaired.first?.workflowID, workflowB.id)
    }

    func testQueueRepairSkipsOrphanedTask() {
        let orphanTask = TaskRecord(
            workflowID: UUID().uuidString,
            title: "Orphan Task",
            detail: "No workflow",
            department: .kairos,
            assignee: "Kairos"
        )

        let repaired = ExecutionPackageRepairService().repairMissingQueueItems(
            workflows: [],
            tasks: [orphanTask],
            queueItems: []
        )

        XCTAssertTrue(repaired.isEmpty)
    }

    func testRepairableIssueCountIncludesMissingTasksAndQueueItems() {
        let workflowA = makeWorkflow(title: "A")
        let workflowB = makeWorkflow(title: "B")
        let taskA = TaskRuntimeService().createInitialTask(for: workflowA)

        let count = ExecutionPackageRepairService().repairableIssueCount(
            workflows: [workflowA, workflowB],
            tasks: [taskA],
            queueItems: []
        )

        XCTAssertEqual(count, 2)
    }

    func testHealthyPackagesProduceNoRepairs() {
        let workflow = makeWorkflow(title: "Healthy")
        let task = TaskRuntimeService().createInitialTask(for: workflow)
        let queueItem = ProductionQueueService().createQueueItem(for: task, workflow: workflow)
        let service = ExecutionPackageRepairService()

        XCTAssertTrue(service.repairMissingTasks(workflows: [workflow], tasks: [task]).isEmpty)
        XCTAssertTrue(service.repairMissingQueueItems(
            workflows: [workflow],
            tasks: [task],
            queueItems: [queueItem]
        ).isEmpty)
    }

    private func makeWorkflow(title: String) -> WorkflowRecord {
        WorkflowRecord(
            customer: "MMG Executive",
            projectID: UUID().uuidString,
            projectTitle: title,
            type: .kairosOrchestration,
            owner: "Kairos",
            summary: "Repair test workflow"
        )
    }
}
