import XCTest
@testable import MMGIOS

final class ExecutionPackageRuntimeServiceTests: XCTestCase {
    func testStartAdvancesWorkflowAndActivatesTaskAndQueue() {
        let package = makePackage()
        let transitions = ExecutionPackageRuntimeService().start(
            workflow: package.workflow,
            task: package.task,
            queueItem: package.queueItem
        )

        XCTAssertEqual(transitions.count, 2)
        XCTAssertEqual(package.workflow.stage, RuntimeWorkflowStage.production.rawValue)
        XCTAssertEqual(package.workflow.status, RuntimeWorkflowStatus.active.rawValue)
        XCTAssertEqual(package.task.status, ProductionTaskStatus.inProgress.rawValue)
        XCTAssertEqual(package.queueItem.status, ProductionQueueStatus.active.rawValue)
    }

    func testBlockSynchronizesWorkflowTaskAndQueue() {
        let package = makePackage()
        ExecutionPackageRuntimeService().block(
            workflow: package.workflow,
            task: package.task,
            queueItem: package.queueItem,
            reason: "Missing approval"
        )

        XCTAssertEqual(package.workflow.status, RuntimeWorkflowStatus.blocked.rawValue)
        XCTAssertEqual(package.task.status, ProductionTaskStatus.blocked.rawValue)
        XCTAssertEqual(package.task.blocker, "Missing approval")
        XCTAssertEqual(package.queueItem.status, ProductionQueueStatus.blocked.rawValue)
        XCTAssertEqual(package.queueItem.blocker, "Missing approval")
    }

    func testRetryClearsBlockersAndQueuesRetry() {
        let package = makePackage()
        let service = ExecutionPackageRuntimeService()
        service.block(
            workflow: package.workflow,
            task: package.task,
            queueItem: package.queueItem,
            reason: "Temporary failure"
        )
        service.retry(
            workflow: package.workflow,
            task: package.task,
            queueItem: package.queueItem
        )

        XCTAssertEqual(package.workflow.status, RuntimeWorkflowStatus.active.rawValue)
        XCTAssertEqual(package.task.status, ProductionTaskStatus.ready.rawValue)
        XCTAssertTrue(package.task.blocker.isEmpty)
        XCTAssertEqual(package.queueItem.status, ProductionQueueStatus.retry.rawValue)
        XCTAssertTrue(package.queueItem.blocker.isEmpty)
    }

    func testCompleteMovesPackageToDelivery() {
        let package = makePackage()
        let service = ExecutionPackageRuntimeService()
        _ = service.start(
            workflow: package.workflow,
            task: package.task,
            queueItem: package.queueItem
        )
        let transitions = service.complete(
            workflow: package.workflow,
            task: package.task,
            queueItem: package.queueItem
        )

        XCTAssertFalse(transitions.isEmpty)
        XCTAssertEqual(package.workflow.stage, RuntimeWorkflowStage.delivery.rawValue)
        XCTAssertEqual(package.workflow.status, RuntimeWorkflowStatus.completed.rawValue)
        XCTAssertEqual(package.task.status, ProductionTaskStatus.completed.rawValue)
        XCTAssertEqual(package.queueItem.status, ProductionQueueStatus.completed.rawValue)
    }

    private func makePackage() -> (workflow: WorkflowRecord, task: TaskRecord, queueItem: ProductionQueueRecord) {
        let workflow = WorkflowRecord(
            customer: "MMG Executive",
            projectID: UUID().uuidString,
            projectTitle: "Test Package",
            type: .publishing,
            owner: "Publishing",
            summary: "Test"
        )
        let task = TaskRuntimeService().createInitialTask(for: workflow)
        let queueItem = ProductionQueueService().createQueueItem(for: task, workflow: workflow)
        return (workflow, task, queueItem)
    }
}
