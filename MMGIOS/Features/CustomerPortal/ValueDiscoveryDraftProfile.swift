import Foundation

struct ValueDiscoveryDraftProfile {
    let knowledgeExpertise: String
    let skills: String
    let professionalExperience: String
    let lifeExperience: String
    let interests: String
    let desiredOutcomes: String

    var completionScore: Int {
        let values = [knowledgeExpertise, skills, professionalExperience, lifeExperience, interests, desiredOutcomes]
        let completed = values.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.count
        return Int((Double(completed) / Double(values.count)) * 100)
    }

    var recommendations: [ValueDiscoveryRecommendation] {
        [
            ValueDiscoveryRecommendation(
                title: "Create a Value Positioning Brief",
                lane: "Identity",
                detail: "Lead with \(primaryKnowledgeSignal), then clarify who it helps and why it matters."
            ),
            ValueDiscoveryRecommendation(
                title: "Build the First Durable Asset",
                lane: "Asset Path",
                detail: "Package \(primarySkillSignal) into a guide, checklist, service outline, template, or content series."
            ),
            ValueDiscoveryRecommendation(
                title: "Map the Audience Path",
                lane: "Audience",
                detail: "Use \(primaryInterestSignal) to define the first public teaching lane."
            ),
            ValueDiscoveryRecommendation(
                title: "Choose the Next Execution Step",
                lane: "Execution",
                detail: "Move toward \(primaryOutcomeSignal) with one draft, one review, and one publishable asset."
            )
        ]
    }

    private var primaryKnowledgeSignal: String {
        firstSignal(from: knowledgeExpertise, fallback: "the customer's strongest knowledge area")
    }

    private var primarySkillSignal: String {
        firstSignal(from: skills, fallback: "the strongest skill")
    }

    private var primaryInterestSignal: String {
        firstSignal(from: interests, fallback: "the customer's strongest interest area")
    }

    private var primaryOutcomeSignal: String {
        firstSignal(from: desiredOutcomes, fallback: "the desired outcome")
    }

    private func firstSignal(from value: String, fallback: String) -> String {
        value
            .components(separatedBy: CharacterSet(charactersIn: ",\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? fallback
    }
}
