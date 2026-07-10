import Foundation

struct KairosDepartmentTemplate: Equatable {
    let departmentName: String
    let objective: String
    let stages: [String]
    let approvalRequired: Bool
    let completionDefinition: String

    static func template(for departmentName: String) -> KairosDepartmentTemplate {
        switch normalized(departmentName) {
        case "publishing":
            return .init(
                departmentName: "Publishing",
                objective: "Move an approved manuscript or publishing asset through editorial and release preparation.",
                stages: ["Intake", "Editorial Review", "Formatting", "Metadata", "Proof", "Approval", "Release"],
                approvalRequired: true,
                completionDefinition: "Approved publication package is ready for controlled release."
            )
        case "designstudio":
            return .init(
                departmentName: "Design Studio",
                objective: "Produce and refine MMG-native creative assets inside the controlled production workspace.",
                stages: ["Brief", "Source Review", "Production", "Revision", "Approval", "Export", "Archive"],
                approvalRequired: true,
                completionDefinition: "Final approved deliverable is exported while production sources remain in the ecosystem."
            )
        case "growth":
            return .init(
                departmentName: "Growth",
                objective: "Create, distribute, and measure campaigns that support audience and revenue growth.",
                stages: ["Goal", "Audience", "Offer", "Asset Production", "Schedule", "Distribution", "Measurement"],
                approvalRequired: false,
                completionDefinition: "Campaign is distributed and performance data is captured for reuse."
            )
        case "releaseoperations":
            return .init(
                departmentName: "Release Operations",
                objective: "Validate release gates and publish only approved customer-facing deliverables.",
                stages: ["Package Review", "Gate Validation", "Approval Check", "Publish", "Verification", "Archive"],
                approvalRequired: true,
                completionDefinition: "Release is published, verified, and recorded with an audit trail."
            )
        case "knowledgemanagement":
            return .init(
                departmentName: "Knowledge Management",
                objective: "Preserve context, decisions, SOPs, and reusable institutional knowledge.",
                stages: ["Capture", "Classify", "Link", "Review", "Promote", "Archive"],
                approvalRequired: false,
                completionDefinition: "Knowledge record is linked, searchable, and ready for reuse."
            )
        case "engineering":
            return .init(
                departmentName: "Engineering",
                objective: "Translate approved direction into additive, testable, reviewable implementation work.",
                stages: ["Scope", "Design", "Implement", "Review", "Validate", "Release"],
                approvalRequired: true,
                completionDefinition: "Implementation is reviewed, validated, documented, and ready to merge."
            )
        case "workflowruntime":
            return .init(
                departmentName: "Workflow Runtime",
                objective: "Convert operating intent into sequenced tasks, dependencies, and queue movement.",
                stages: ["Intake", "Plan", "Task Generation", "Dependency Check", "Queue", "Execution", "Close"],
                approvalRequired: false,
                completionDefinition: "All required tasks are completed and runtime state is current."
            )
        default:
            return .init(
                departmentName: "Executive Office",
                objective: "Clarify authority, prioritize work, resolve decisions, and preserve governance context.",
                stages: ["Review", "Assess", "Decide", "Approve", "Delegate", "Verify"],
                approvalRequired: true,
                completionDefinition: "Decision is recorded, delegated, and verified against governing doctrine."
            )
        }
    }

    var formattedPlan: String {
        stages.enumerated().map { index, stage in
            "\(index + 1). \(stage)"
        }.joined(separator: "\n")
    }

    private static func normalized(_ value: String) -> String {
        value
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "-", with: "")
            .lowercased()
    }
}
