import Foundation

struct KairosDepartmentRouter {
    func route(_ command: String) -> KairosRouteDecision {
        let normalized = command.lowercased()
        let department = classify(normalized)
        let confidence = confidenceScore(for: normalized, department: department)

        return KairosRouteDecision(
            department: department,
            confidence: confidence,
            summary: summary(for: department),
            executionPlan: executionPlan(for: department),
            governanceNote: governanceNote(for: department)
        )
    }

    private func classify(_ command: String) -> KairosDepartment {
        if containsAny(command, ["approve", "approval", "decision", "sign off", "gate", "blocked", "blocker"]) {
            return .executiveOffice
        }

        if containsAny(command, ["shopify", "storefront", "homepage", "home page", "website", "theme", "navigation", "product page"]) {
            return .shopifyWebsite
        }

        if containsAny(command, ["publish", "release", "deliverable", "customer portal", "portal", "ship", "launch"]) {
            return .releaseOperations
        }

        if containsAny(command, ["book", "manuscript", "kdp", "isbn", "editorial", "proof", "publishing"]) {
            return .publishing
        }

        if containsAny(command, ["design", "asset", "cover", "image", "studio", "resize", "creative", "brand"]) {
            return .designStudio
        }

        if containsAny(command, ["marketing", "campaign", "tiktok", "content", "growth", "social", "ad", "funnel"]) {
            return .growth
        }

        if containsAny(command, ["knowledge", "vault", "sop", "doctrine", "memory", "document", "record"]) {
            return .knowledgeManagement
        }

        if containsAny(command, ["workflow", "task", "queue", "production", "timeline", "project", "slice", "build"]) {
            return .workflowRuntime
        }

        if containsAny(command, ["api", "backend", "openai", "server", "runtime", "code", "repository", "github"]) {
            return .engineering
        }

        return .executiveOffice
    }

    private func confidenceScore(for command: String, department: KairosDepartment) -> Double {
        let keywordHits = department.routingKeywords.filter { command.contains($0) }.count

        switch keywordHits {
        case 3...:
            return 0.92
        case 2:
            return 0.84
        case 1:
            return 0.72
        default:
            return department == .executiveOffice ? 0.58 : 0.50
        }
    }

    private func containsAny(_ command: String, _ keywords: [String]) -> Bool {
        keywords.contains { command.contains($0) }
    }

    private func summary(for department: KairosDepartment) -> String {
        switch department {
        case .shopifyWebsite:
            return "Shopify & Website should own this because it concerns the live storefront, theme, homepage, navigation, or commerce content."
        case .executiveOffice:
            return "Executive Office should own this because it affects prioritization, approval, governance, or final decision authority."
        case .workflowRuntime:
            return "Workflow Runtime should own this because it concerns tasks, queues, project movement, and execution sequencing."
        case .publishing:
            return "Publishing should own this because it concerns manuscripts, books, editorial preparation, or publication readiness."
        case .designStudio:
            return "Design Studio should own this because it concerns creative production assets, covers, image work, or brand materials."
        case .growth:
            return "Growth should own this because it concerns marketing, campaign execution, content distribution, or audience development."
        case .releaseOperations:
            return "Release Operations should own this because it concerns controlled publication, customer portal delivery, or release gate status."
        case .knowledgeManagement:
            return "Knowledge Management should own this because it concerns institutional memory, doctrine, SOPs, records, or reusable knowledge assets."
        case .engineering:
            return "Engineering should own this because it concerns backend runtime, API wiring, repository work, or system implementation."
        }
    }

    private func executionPlan(for department: KairosDepartment) -> [String] {
        switch department {
        case .shopifyWebsite:
            return [
                "Inspect the live published theme and relevant storefront evidence.",
                "Compare the current experience with the approved MMG website doctrine.",
                "Prepare the smallest cohesive change package with verification and rollback requirements.",
                "Execute only the approved package through an authorized Shopify adapter."
            ]
        case .executiveOffice:
            return [
                "Clarify the decision required.",
                "Identify affected workflows, releases, or departments.",
                "Surface the recommended next action with risk notes.",
                "Preserve the decision path for future auditability."
            ]
        case .workflowRuntime:
            return [
                "Map the request to the active project or queue lane.",
                "Identify blockers, dependencies, and owner responsibilities.",
                "Convert the request into an executable task sequence.",
                "Update runtime state after completion."
            ]
        case .publishing:
            return [
                "Identify the target publishing asset or manuscript.",
                "Check editorial, formatting, metadata, and approval readiness.",
                "Prepare the next production action.",
                "Route final output through release gates before customer publication."
            ]
        case .designStudio:
            return [
                "Identify the requested creative asset and source context.",
                "Determine required format, channel, dimensions, and approval status.",
                "Prepare the production asset or revision request.",
                "Store source materials inside the MMG/Kairos ecosystem."
            ]
        case .growth:
            return [
                "Identify the campaign goal, channel, audience, and offer.",
                "Generate campaign assets or content tasks.",
                "Schedule distribution and measure performance.",
                "Feed results back into the Knowledge Vault and future campaign templates."
            ]
        case .releaseOperations:
            return [
                "Inspect release package status and gate requirements.",
                "Confirm approvals, deliverables, version, and customer visibility.",
                "Block publication if required evidence is missing.",
                "Publish only when controlled release criteria are satisfied."
            ]
        case .knowledgeManagement:
            return [
                "Classify the knowledge artifact type.",
                "Store the record with source context and ownership.",
                "Link it to related projects, workflows, or decisions.",
                "Promote reusable patterns into SOPs or templates when appropriate."
            ]
        case .engineering:
            return [
                "Convert the request into a scoped implementation slice.",
                "Identify files, data models, dependencies, and acceptance criteria.",
                "Make additive, reviewable changes on a branch.",
                "Open a draft PR with validation notes and merge order."
            ]
        }
    }

    private func governanceNote(for department: KairosDepartment) -> String {
        switch department {
        case .shopifyWebsite:
            return "Live theme inspection is read-only. Theme writes require explicit approval, rollback material, and verified Shopify write authorization."
        case .executiveOffice:
            return "Final authority remains with the executive when governance, roadmap, or customer-facing release risk is involved."
        case .releaseOperations:
            return "Customer-facing publication must pass controlled release gates before visibility changes."
        case .designStudio:
            return "Intermediate creative assets remain inside the MMG/Kairos production ecosystem unless explicitly approved as final deliverables."
        case .knowledgeManagement:
            return "Institutional knowledge should preserve source context, rationale, and reuse potential."
        default:
            return "Execution should preserve auditability, reduce cognitive load, and avoid silent governance drift."
        }
    }
}

struct KairosRouteDecision: Equatable {
    let department: KairosDepartment
    let confidence: Double
    let summary: String
    let executionPlan: [String]
    let governanceNote: String

    var formattedResponse: String {
        let confidencePercent = Int((confidence * 100).rounded())
        let steps = executionPlan.enumerated().map { index, step in
            "\(index + 1). \(step)"
        }.joined(separator: "\n")

        return "Routing decision: \(department.displayName) (\(confidencePercent)% confidence)\n\n\(summary)\n\nExecution plan:\n\(steps)\n\nGovernance: \(governanceNote)"
    }
}

enum KairosDepartment: String, CaseIterable, Equatable {
    case shopifyWebsite
    case executiveOffice
    case workflowRuntime
    case publishing
    case designStudio
    case growth
    case releaseOperations
    case knowledgeManagement
    case engineering

    var displayName: String {
        switch self {
        case .shopifyWebsite:
            return "Shopify & Website"
        case .executiveOffice:
            return "Executive Office"
        case .workflowRuntime:
            return "Workflow Runtime"
        case .publishing:
            return "Publishing"
        case .designStudio:
            return "Design Studio"
        case .growth:
            return "Growth"
        case .releaseOperations:
            return "Release Operations"
        case .knowledgeManagement:
            return "Knowledge Management"
        case .engineering:
            return "Engineering"
        }
    }

    var routingKeywords: [String] {
        switch self {
        case .shopifyWebsite:
            return ["shopify", "storefront", "homepage", "home page", "website", "theme", "navigation", "product page"]
        case .executiveOffice:
            return ["approve", "approval", "decision", "sign off", "gate", "blocked", "blocker"]
        case .workflowRuntime:
            return ["workflow", "task", "queue", "production", "timeline", "project", "slice", "build"]
        case .publishing:
            return ["book", "manuscript", "kdp", "isbn", "editorial", "proof", "publishing"]
        case .designStudio:
            return ["design", "asset", "cover", "image", "studio", "resize", "creative", "brand"]
        case .growth:
            return ["marketing", "campaign", "tiktok", "content", "growth", "social", "ad", "funnel"]
        case .releaseOperations:
            return ["publish", "release", "deliverable", "customer portal", "portal", "ship", "launch"]
        case .knowledgeManagement:
            return ["knowledge", "vault", "sop", "doctrine", "memory", "document", "record"]
        case .engineering:
            return ["api", "backend", "openai", "server", "runtime", "code", "repository", "github"]
        }
    }
}
