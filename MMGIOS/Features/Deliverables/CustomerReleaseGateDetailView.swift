import SwiftUI

struct CustomerReleaseGateDetailView: View {
    let release: CustomerReleaseRecord

    private let releaseGatePolicy = CustomerReleaseGatePolicy()

    private var report: CustomerReleaseGateReport {
        releaseGatePolicy.evaluate(release)
    }

    private var statusLabel: String {
        report.passed ? "Gate clear" : "Blocked"
    }

    var body: some View {
        List {
            Section("Release") {
                LabeledContent("Title", value: release.title)
                LabeledContent("Status", value: release.status)
                LabeledContent("Channel", value: release.channel)
                LabeledContent("Version", value: "v\(release.version)")
                LabeledContent("Location", value: release.releaseLocation)
            }

            Section("Gate Summary") {
                Label(statusLabel, systemImage: report.passed ? "checkmark.seal" : "exclamationmark.triangle")
                    .foregroundColor(report.passed ? .secondary : .orange)
                Text(report.summary)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                if !release.gateSummary.isEmpty {
                    Text(release.gateSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Gate Results") {
                ForEach(report.results) { result in
                    VStack(alignment: .leading, spacing: 6) {
                        Label(result.gate.rawValue, systemImage: result.passed ? "checkmark.circle" : "xmark.octagon")
                            .font(.subheadline.bold())
                            .foregroundColor(result.passed ? .secondary : .orange)
                        Text(result.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Approval Metadata") {
                LabeledContent("Approved by", value: release.approvedBy.isEmpty ? "Missing" : release.approvedBy)
                LabeledContent("Approval notes", value: release.approvalNotes.isEmpty ? "Missing" : release.approvalNotes)
                if let approvedAt = release.approvedAt {
                    LabeledContent("Approved at", value: approvedAt.formatted(date: .abbreviated, time: .shortened))
                } else {
                    LabeledContent("Approved at", value: "Missing")
                }
                if let publishedAt = release.publishedAt {
                    LabeledContent("Published at", value: publishedAt.formatted(date: .abbreviated, time: .shortened))
                }
            }

            Section("Operational Rule") {
                Text("Only approved final deliverables may be released to controlled Customer Portal access. Intermediate production assets, editable files, layered files, drafts, and reusable source materials stay inside MMG/Kairos unless explicitly approved as final customer deliverables.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Release Gate")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        CustomerReleaseGateDetailView(
            release: CustomerReleaseRecord(
                deliverableID: "deliverable-preview",
                projectID: "project-preview",
                workflowID: "workflow-preview",
                taskID: "task-preview",
                assetID: "asset-preview",
                title: "Customer Release Preview",
                summary: "Preview release gate detail state.",
                status: .internalReview,
                channel: .customerPortal,
                version: 1,
                releaseLocation: "portal-secure://preview/customer-release"
            )
        )
    }
}
