import Foundation

struct ExecutiveWorkflowFactory {
    private let runtime = WorkflowRuntimeService()

    func createWorkflow(from record: KnowledgeVaultRecord) -> WorkflowRecord {
        let department = extractValue(prefix: "Department:", from: record.decisionHistory) ?? "Kairos"
        let summary = extractValue(prefix: "Summary:", from: record.decisionHistory) ?? record.projectContext
        let type = workflowType(for: department)
        let priority: RuntimeWorkflowPriority = ExecutiveActionPriority.from(record: record) == .high ? .high : .normal

        return runtime.createWorkflow(
            customer: record.customerName.isEmpty ? "MMG Executive" : record.customerName,
            projectID: record.id,
            projectTitle: record.projectContext.isEmpty ? "Kairos Routed Action" : record.projectContext,
            type: type,
            priority: priority,
            owner: department,
            summary: summary
        )
    }

    private func workflowType(for department: String) -> RuntimeWorkflowType {
        let normalized = department
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "-", with: "")
            .lowercased()

        return RuntimeWorkflowType(rawValue: normalized) ?? .designStudio
    }

    private func extractValue(prefix: String, from text: String) -> String? {
        text
            .components(separatedBy: .newlines)
            .first { $0.hasPrefix(prefix) }?
            .replacingOccurrences(of: prefix, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
