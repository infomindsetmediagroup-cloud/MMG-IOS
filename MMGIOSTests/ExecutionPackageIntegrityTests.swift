import XCTest
@testable import MMGIOS

final class ExecutionPackageIntegrityTests: XCTestCase {
    func testCompletePackageProducesHealthyReport() {
        let package = makePackage()

        let report = ExecutionPackageIntegrityPolicy.report(
            workflows: [package.workflow],
            tasks: [package.task],
            queueItems: [package.queueItem]
        )

        XCTAssertTrue(report.isHealthy)
        XCTAssertEqual(report.issueCount, 0)
        XCTAssertEqual(report.completePackageCount, 1)
    }

    func testWorkflowWithoutTaskIsReported() {
        let package = makePackage()

        let report = ExecutionPackageIntegrityPolicy.report(
            workflows: [package.workflow],
            tasks: [],
            queueItems: []
        )

        XCTAssertEqual(report.workflowsMissingTasks, [package.workflow.id])
        XCTAssertFalse(report.isHealthy)
    }

    func testTaskWithoutWorkflowIsReported() {
        let package = makePackage()

        let report = ExecutionPackageIntegrityPolicy.report(
            workflows: [],
            tasks: [package.task],
            queueItems: [package.queueItem]
        )

        XCTAssertEqual(report.tasksMissingWorkflows, [package.task.id])
        XCTAssertFalse(report.isHealthy)
    }

    func testTaskWithoutQueueItemIsReported() {
        let package = makePackage()

        let report = ExecutionPackageIntegrityPolicy.report(
            workflows: [package.workflow],
            tasks: [package.task],
            queueItems: []
        )

        XCTAssertEqual(report.tasksMissingQueueItems, [package.task.id])
        XCTAssertFalse(report.isHealthy)
    }

    func testQueueItemWithoutTaskIsReported() {
        let package = makePackage()

        let report = ExecutionPackageIntegrityPolicy.report(
            workflows: [],
            tasks: [],
            queueItems: [package.queueItem]
        )

        XCTAssertEqual(report.queueItemsMissingTasks, [package.queueItem.id])
        XCTAssertFalse(report.isHealthy)
    }

    func testIssueCountAggregatesAllBrokenLinks() {
        let package = makePackage()
        let orphanWorkflow = makeWorkflow(title: "Orphan Workflow")
        let orphanTask = TaskRecord(
            workflowID: UUID().uuidString,
            title: "Orphan Task",
            detail: "Missing workflow and queue",
            department: .kairos,
            assignee: "Kairos"
        )
        let orphanQueue = ProductionQueueRecord(
            taskID: UUID().uuidString,
            workflowID: UUID().uuidString,
            lane: .intake,
            summary: "Orphan queue item"
        )

        let report = ExecutionPackageIntegrityPolicy.report(
            workflows: [package.workflow, orphanWorkflow],
            tasks: [package.task, orphanTask],
            queueItems: [package.queueItem, orphanQueue]
        )

        XCTAssertEqual(report.issueCount, 4)
        XCTAssertEqual(report.completePackageCount, 1)
    }

    private func makePackage() -> (
        workflow: WorkflowRecord,
        task: TaskRecord,
        queueItem: ProductionQueueRecord
    ) {
        let workflow = makeWorkflow(title: "Integrity Test")
        let task = TaskRuntimeService().createInitialTask(for: workflow)
        let queueItem = ProductionQueueService().createQueueItem(for: task, workflow: workflow)
        return (workflow, task, queueItem)
    }

    private func makeWorkflow(title: String) -> WorkflowRecord {
        WorkflowRecord(
            customer: "MMG Executive",
            projectID: UUID().uuidString,
            projectTitle: title,
            type: .kairosOrchestration,
            owner: "Kairos",
            summary: "Integrity test workflow"
        )
    }
}
