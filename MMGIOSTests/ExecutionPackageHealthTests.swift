import XCTest
@testable import MMGIOS

final class ExecutionPackageHealthTests: XCTestCase {
    func testReadyPackageIsReady() {
        let package = makePackage()

        XCTAssertEqual(
            ExecutionPackageHealthPolicy.state(
                workflow: package.workflow,
                task: package.task,
                queueItem: package.queueItem
            ),
            .ready
        )
    }

    func testActiveTaskMakesPackageActive() {
        let package = makePackage()
        TaskRuntimeService().start(package.task)

        XCTAssertEqual(
            ExecutionPackageHealthPolicy.state(
                workflow: package.workflow,
                task: package.task,
                queueItem: package.queueItem
            ),
            .active
        )
    }

    func testBlockedWorkflowMakesPackageBlocked() {
        let package = makePackage()
        package.workflow.status = RuntimeWorkflowStatus.blocked.rawValue

        XCTAssertEqual(
            ExecutionPackageHealthPolicy.state(
                workflow: package.workflow,
                task: package.task,
                queueItem: package.queueItem
            ),
            .blocked
        )
    }

    func testCompletedTaskAndQueueMakePackageComplete() {
        let package = makePackage()
        TaskRuntimeService().complete(package.task)
        ProductionQueueService().complete(package.queueItem)

        XCTAssertEqual(
            ExecutionPackageHealthPolicy.state(
                workflow: package.workflow,
                task: package.task,
                queueItem: package.queueItem
            ),
            .completed
        )
    }

    func testTaskBlockerTakesPrecedence() {
        let package = makePackage()
        package.task.blocker = "Missing manuscript"
        package.queueItem.blocker = "Queue paused"

        XCTAssertEqual(
            ExecutionPackageHealthPolicy.blocker(
                task: package.task,
                queueItem: package.queueItem
            ),
            "Missing manuscript"
        )
    }

    func testPackageBuilderIgnoresIncompleteChains() {
        let package = makePackage()

        XCTAssertEqual(
            ExecutionPackageHealthPolicy.packages(
                workflows: [package.workflow],
                tasks: [],
                queueItems: [package.queueItem]
            ).count,
            0
        )
    }

    private func makePackage() -> (
        workflow: WorkflowRecord,
        task: TaskRecord,
        queueItem: ProductionQueueRecord
    ) {
        let workflow = WorkflowRecord(
            customer: "MMG Executive",
            projectID: UUID().uuidString,
            projectTitle: "Health Test",
            type: .publishing,
            owner: "Publishing",
            summary: "Health test package"
        )
        let task = TaskRuntimeService().createInitialTask(for: workflow)
        let queueItem = ProductionQueueService().createQueueItem(for: task, workflow: workflow)
        return (workflow, task, queueItem)
    }
}
