import XCTest
@testable import MMGIOS

final class ExecutiveExecutionCoordinatorTests: XCTestCase {
    func testApproveAndQueueCreatesAReadyPackageWithOneDecision() {
        let record = KnowledgeVaultRecord(
            customerName: "MMG Executive",
            projectContext: "Update the MMG homepage",
            decisionHistory: "Department: Engineering\nSummary: Implement the approved guided homepage experience."
        )

        let package = ExecutiveExecutionCoordinator().approveAndQueue(record: record)

        XCTAssertEqual(package.workflow.projectID, record.id)
        XCTAssertEqual(package.workflow.status, RuntimeWorkflowStatus.draft.rawValue)
        XCTAssertEqual(package.workflow.stage, RuntimeWorkflowStage.intake.rawValue)
        XCTAssertEqual(package.task.status, ProductionTaskStatus.ready.rawValue)
        XCTAssertEqual(package.queueItem.status, ProductionQueueStatus.ready.rawValue)
        XCTAssertTrue(record.decisionHistory.contains("Approval Decision: Approved"))
        XCTAssertTrue(record.decisionHistory.contains("Action Status: Ready"))
        XCTAssertTrue(record.decisionHistory.contains("waiting for an authorized execution adapter"))
    }
}
