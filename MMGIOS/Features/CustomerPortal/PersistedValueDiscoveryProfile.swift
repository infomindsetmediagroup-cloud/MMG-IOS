import Foundation
import SwiftData

@Model
final class PersistedValueDiscoveryProfile {
    var knowledgeExpertise: String
    var skills: String
    var professionalExperience: String
    var lifeExperience: String
    var interests: String
    var desiredOutcomes: String
    var updatedAt: Date

    init(
        knowledgeExpertise: String = "",
        skills: String = "",
        professionalExperience: String = "",
        lifeExperience: String = "",
        interests: String = "",
        desiredOutcomes: String = "",
        updatedAt: Date = .now
    ) {
        self.knowledgeExpertise = knowledgeExpertise
        self.skills = skills
        self.professionalExperience = professionalExperience
        self.lifeExperience = lifeExperience
        self.interests = interests
        self.desiredOutcomes = desiredOutcomes
        self.updatedAt = updatedAt
    }

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
                detail: "Clarify the strongest knowledge area, who it helps, and why it matters."
            ),
            ValueDiscoveryRecommendation(
                title: "Build the First Durable Asset",
                lane: "Asset Path",
                detail: "Package the strongest skill into a guide, checklist, service outline, template, or content series."
            ),
            ValueDiscoveryRecommendation(
                title: "Map the Audience Path",
                lane: "Audience",
                detail: "Use the strongest interest area to define the first public teaching lane."
            ),
            ValueDiscoveryRecommendation(
                title: "Choose the Next Execution Step",
                lane: "Execution",
                detail: "Move toward the desired outcome with one draft, one review, and one publishable asset."
            )
        ]
    }
}

struct ValueDiscoveryRecommendation: Identifiable {
    let id = UUID()
    let title: String
    let lane: String
    let detail: String
}
