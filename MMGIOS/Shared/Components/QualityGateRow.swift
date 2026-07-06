import SwiftUI

struct QualityGateRow: View {
    let gate: QualityGate
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: gate.status == .passed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(gate.status == .passed ? .green : .secondary)
                    .font(.title3)

                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text(gate.title)
                            .font(.headline)
                            .foregroundStyle(.primary)

                        if gate.required {
                            Text("Required")
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 4)
                                .background(Color.mmgBlue.opacity(0.12), in: Capsule())
                                .foregroundStyle(.mmgBlue)
                        }
                    }

                    Text(gate.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
    }
}
