import Foundation

struct ExecutiveWorkflowFactory {
    private let runtime = WorkflowRuntimeService()

    func createWorkflow(from record: KnowledgeVaultRecord) -> WorkflowRecord {
        let department = extractValue(prefix: "Department:", from: record.decisionHistory) ?? "Kairos"
        let routedSummary = extractValue(prefix: "Summary:", from: record.decisionHistory) ?? record.projectContext
        let template = KairosDepartmentTemplate.template(for: department)
        let type = workflowType(for: template.departmentName)
        let priority: RuntimeWorkflowPriority = ExecutiveActionPriority.from(record: record) == .high ? .high : .normal
        let summary = [
            routedSummary,
            "Objective: \(template.objective)",
            "Template stages:",
            template.formattedPlan,
            "Completion: \(template.completionDefinition)"
        ].joined(separator: "\n")

        return runtime.createWorkflow(
            customer: record.customerName.isEmpty ? "MMG Executive" : record.customerName,
            projectID: record.id,
            projectTitle: record.projectContext.isEmpty ? "Kairos Routed Action" : record.projectContext,
            type: type,
            priority: priority,
            owner: template.departmentName,
            summary: summary
        )
    }

    func template(from record: KnowledgeVaultRecord) -> KairosDepartmentTemplate {
        let department = extractValue(prefix: "Department:", from: record.decisionHistory) ?? "Kairos"
        return KairosDepartmentTemplate.template(for: department)
    }

    func workflowType(for department: String) -> RuntimeWorkflowType {
        switch normalized(department) {
        case "publishing":
            return .publishing
        case "designstudio":
            return .designStudio
        case "growth":
            return .marketing
        case "releaseoperations":
            return .customerSuccess
        case "engineering", "workflowruntime", "knowledgemanagement", "executiveoffice", "kairos":
            return .kairosOrchestration
        default:
            return .kairosOrchestration
        }
    }

    private func normalized(_ value: String) -> String {
        value
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "-", with: "")
            .lowercased()
    }

    private func extractValue(prefix: String, from text: String) -> String? {
        text
            .components(separatedBy: .newlines)
            .first { $0.hasPrefix(prefix) }?
            .replacingOccurrences(of: prefix, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
