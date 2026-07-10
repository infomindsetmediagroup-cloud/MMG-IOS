import XCTest
@testable import MMGIOS

final class KairosRuntimeFoundationTests: XCTestCase {
    func testPublishingCommandRoutesToPublishing() {
        let decision = KairosDepartmentRouter().route("Prepare this manuscript for KDP publishing")

        XCTAssertEqual(decision.department, .publishing)
        XCTAssertGreaterThanOrEqual(decision.confidence, 0.70)
        XCTAssertFalse(decision.executionPlan.isEmpty)
    }

    func testDesignCommandRoutesToDesignStudio() {
        let decision = KairosDepartmentRouter().route("Create a book cover and resize the asset")

        XCTAssertEqual(decision.department, .designStudio)
        XCTAssertTrue(decision.governanceNote.contains("MMG/Kairos"))
    }

    func testEngineeringCommandRoutesToEngineering() {
        let decision = KairosDepartmentRouter().route("Wire the OpenAI backend API into the repository")

        XCTAssertEqual(decision.department, .engineering)
        XCTAssertTrue(decision.formattedResponse.contains("Engineering"))
    }

    func testPublishingTemplateRequiresApproval() {
        let template = KairosDepartmentTemplate.template(for: "Publishing")

        XCTAssertEqual(template.departmentName, "Publishing")
        XCTAssertTrue(template.approvalRequired)
        XCTAssertTrue(template.stages.contains("Editorial Review"))
        XCTAssertFalse(template.completionDefinition.isEmpty)
    }

    func testGrowthTemplateDoesNotRequireApproval() {
        let template = KairosDepartmentTemplate.template(for: "Growth")

        XCTAssertEqual(template.departmentName, "Growth")
        XCTAssertFalse(template.approvalRequired)
        XCTAssertTrue(template.stages.contains("Measurement"))
    }

    func testRequiredApprovalBlocksExecutionUntilApproved() {
        let record = makeRecord(department: "Publishing", historySuffix: "")
        let policy = KairosApprovalPolicy()

        XCTAssertTrue(policy.requirement(for: record).isRequired)
        XCTAssertFalse(policy.canCreateExecutionPackage(for: record))
    }

    func testApprovedRecordCanCreateExecutionPackage() {
        let record = makeRecord(
            department: "Publishing",
            historySuffix: "Approval Decision: Approved | Category: Executive | Actor: MMG Executive | Time: Jul 9, 2026"
        )
        let policy = KairosApprovalPolicy()

        XCTAssertTrue(policy.requirement(for: record).isApproved)
        XCTAssertTrue(policy.canCreateExecutionPackage(for: record))
    }

    func testRejectedRecordCannotCreateExecutionPackage() {
        let record = makeRecord(
            department: "Publishing",
            historySuffix: "Approval Decision: Rejected | Category: Executive | Actor: MMG Executive | Time: Jul 9, 2026"
        )
        let policy = KairosApprovalPolicy()

        XCTAssertTrue(policy.requirement(for: record).isRejected)
        XCTAssertFalse(policy.canCreateExecutionPackage(for: record))
    }

    func testPersistedActionStatusUsesLatestMarker() {
        let record = makeRecord(
            department: "Engineering",
            historySuffix: "Action Status: Ready @ Jul 9, 2026\n\nAction Status: In Progress @ Jul 9, 2026"
        )

        XCTAssertEqual(ExecutiveActionState.from(record: record), .inProgress)
    }

    func testWorkflowTypeMappingUsesPublishingForPublishingDepartment() {
        XCTAssertEqual(ExecutiveWorkflowFactory().workflowType(for: "Publishing"), .publishing)
    }

    func testWorkflowTypeMappingUsesMarketingForGrowthDepartment() {
        XCTAssertEqual(ExecutiveWorkflowFactory().workflowType(for: "Growth"), .marketing)
    }

    func testWorkflowTypeMappingUsesKairosOrchestrationForEngineering() {
        XCTAssertEqual(ExecutiveWorkflowFactory().workflowType(for: "Engineering"), .kairosOrchestration)
    }

    func testWorkflowTypeMappingUsesCustomerSuccessForReleaseOperations() {
        XCTAssertEqual(ExecutiveWorkflowFactory().workflowType(for: "Release Operations"), .customerSuccess)
    }

    private func makeRecord(department: String, historySuffix: String) -> KnowledgeVaultRecord {
        let baseHistory = [
            "Source: Kairos Chat",
            "Input: Test command",
            "Department: \(department)",
            "Confidence: 90%",
            "Summary: Test routed action"
        ].joined(separator: "\n")

        let history = historySuffix.isEmpty ? baseHistory : baseHistory + "\n\n" + historySuffix

        return KnowledgeVaultRecord(
            customerName: "MMG Executive",
            brandProfile: "Mindset Media Group and Kairos operating system",
            projectContext: "Kairos Chat routed to \(department)",
            decisionHistory: history
        )
    }
}
