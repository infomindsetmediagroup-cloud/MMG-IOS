import SwiftUI

struct ValueDiscoveryProfileSection: View {
    @Binding var knowledgeExpertise: String
    @Binding var skills: String
    @Binding var professionalExperience: String
    @Binding var lifeExperience: String
    @Binding var interests: String
    @Binding var desiredOutcomes: String

    let saveMessage: String
    let onSave: () -> Void

    var body: some View {
        Section("Value Discovery") {
            Text("Capture the customer profile Kairos uses to recommend positioning, assets, audience paths, and next execution steps.")
                .font(.caption)
                .foregroundStyle(.secondary)

            TextField("Knowledge and expertise", text: $knowledgeExpertise, axis: .vertical)
            TextField("Skills", text: $skills, axis: .vertical)
            TextField("Professional experience", text: $professionalExperience, axis: .vertical)
            TextField("Life experience", text: $lifeExperience, axis: .vertical)
            TextField("Interests", text: $interests, axis: .vertical)
            TextField("Desired outcomes", text: $desiredOutcomes, axis: .vertical)

            Button(action: onSave) {
                Label("Save Value Discovery", systemImage: "square.and.arrow.down")
            }

            if !saveMessage.isEmpty {
                Text(saveMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    List {
        ValueDiscoveryProfileSection(
            knowledgeExpertise: .constant("Creator education"),
            skills: .constant("Publishing, content systems"),
            professionalExperience: .constant("Technical service and operations"),
            lifeExperience: .constant("Recovery and rebuilding"),
            interests: .constant("Creators and entrepreneurs"),
            desiredOutcomes: .constant("Build assets"),
            saveMessage: "Value Discovery saved.",
            onSave: {}
        )
    }
}
