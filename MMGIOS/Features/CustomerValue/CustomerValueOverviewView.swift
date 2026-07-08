import SwiftUI

struct CustomerValueOverviewView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    CustomerValueHeroCard()

                    CustomerValuePathCard()

                    CustomerValueMicrocopyCard()

                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(
                            eyebrow: "Execution Standard",
                            title: "Package the customer's value into a body of work.",
                            bodyText: "Every Kairos surface should help the user move from scattered experience into organized projects, content, products, services, and long-term assets."
                        )

                        customerValueRules
                    }
                    .padding(18)
                    .background(Color.mmgSurface, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                }
                .padding(20)
            }
            .navigationTitle("Value")
            .background(Color.mmgBackground.ignoresSafeArea())
        }
    }

    private var customerValueRules: some View {
        VStack(alignment: .leading, spacing: 10) {
            ValueRuleRow(
                title: "Lead with the promise",
                detail: "Your Knowledge Has Value should appear before product, publishing, or AI-first positioning."
            )

            ValueRuleRow(
                title: "Avoid hype language",
                detail: "No get-rich framing, income guarantees, or shortcut claims. Keep the voice useful, practical, and steady."
            )

            ValueRuleRow(
                title: "Preserve context",
                detail: "Treat customer work as a connected body of work so ideas compound into assets over time."
            )

            ValueRuleRow(
                title: "Recommend the next action",
                detail: "Kairos should guide execution with concrete next steps instead of generic motivation."
            )
        }
    }
}

private struct ValueRuleRow: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.headline)
                .foregroundStyle(.primary)

            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

#Preview {
    CustomerValueOverviewView()
}
