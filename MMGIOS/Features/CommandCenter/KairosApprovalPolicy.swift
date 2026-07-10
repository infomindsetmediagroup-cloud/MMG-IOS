import Foundation

struct KairosApprovalPolicy {
    func requirement(for record: KnowledgeVaultRecord) -> KairosApprovalRequirement {
        let department = extractValue(prefix: "Department:", from: record.decisionHistory) ?? "Executive Office"
        let template = KairosDepartmentTemplate.template(for: department)
        let category = approvalCategory(for: department, record: record)

        return KairosApprovalRequirement(
            departmentName: template.departmentName,
            category: category,
            isRequired: template.approvalRequired,
            isApproved: latestApprovalDecision(from: record.decisionHistory) == .approved,
            isRejected: latestApprovalDecision(from: record.decisionHistory) == .rejected
        )
    }

    func canCreateExecutionPackage(for record: KnowledgeVaultRecord) -> Bool {
        let requirement = requirement(for: record)
        guard !requirement.isRejected else { return false }
        return !requirement.isRequired || requirement.isApproved
    }

    func approvalNote(
        decision: KairosApprovalDecision,
        category: KairosApprovalCategory,
        actor: String = "MMG Executive"
    ) -> String {
        let timestamp = Date().formatted(date: .abbreviated, time: .shortened)
        return "Approval Decision: \(decision.rawValue) | Category: \(category.rawValue) | Actor: \(actor) | Time: \(timestamp)"
    }

    private func approvalCategory(for department: String, record: KnowledgeVaultRecord) -> KairosApprovalCategory {
        let searchable = "\(department) \(record.projectContext) \(record.decisionHistory)".lowercased()

        if searchable.contains("customer") || searchable.contains("portal") {
            return .customer
        }
        if searchable.contains("brand") || searchable.contains("design") || searchable.contains("creative") {
            return .brand
        }
        if searchable.contains("legal") || searchable.contains("rights") || searchable.contains("license") {
            return .legal
        }
        if searchable.contains("finance") || searchable.contains("budget") || searchable.contains("cost") || searchable.contains("payment") {
            return .financial
        }
        return .executive
    }

    private func latestApprovalDecision(from history: String) -> KairosApprovalDecision? {
        history
            .components(separatedBy: .newlines)
            .reversed()
            .compactMap { line in
                guard line.hasPrefix("Approval Decision:") else { return nil }
                if line.contains(KairosApprovalDecision.approved.rawValue) { return .approved }
                if line.contains(KairosApprovalDecision.rejected.rawValue) { return .rejected }
                return nil
            }
            .first
    }

    private func extractValue(prefix: String, from text: String) -> String? {
        text
            .components(separatedBy: .newlines)
            .first { $0.hasPrefix(prefix) }?
            .replacingOccurrences(of: prefix, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct KairosApprovalRequirement: Equatable {
    let departmentName: String
    let category: KairosApprovalCategory
    let isRequired: Bool
    let isApproved: Bool
    let isRejected: Bool

    var statusLabel: String {
        if isRejected { return "Rejected" }
        if isApproved { return "Approved" }
        if isRequired { return "Required" }
        return "Not Required"
    }
}

enum KairosApprovalDecision: String, Equatable {
    case approved = "Approved"
    case rejected = "Rejected"
}

enum KairosApprovalCategory: String, Equatable {
    case executive = "Executive"
    case brand = "Brand"
    case customer = "Customer"
    case legal = "Legal"
    case financial = "Financial"
}
