import Foundation
import SwiftData

@Model
final class KnowledgeVaultRecord {
    var id: String
    var customerName: String
    var brandProfile: String
    var projectContext: String
    var decisionHistory: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        customerName: String,
        brandProfile: String = "",
        projectContext: String,
        decisionHistory: String = ""
    ) {
        self.id = id
        self.customerName = customerName
        self.brandProfile = brandProfile
        self.projectContext = projectContext
        self.decisionHistory = decisionHistory
        self.createdAt = .now
        self.updatedAt = .now
    }
}
