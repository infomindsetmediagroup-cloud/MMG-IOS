import Foundation

extension KairosProject {
    init(persistedRecord: PersistedProjectRecord) {
        let resolvedArea = WorkflowArea(rawValue: persistedRecord.areaRawValue) ?? .admin
        let resolvedStatus = WorkflowStatus(rawValue: persistedRecord.statusRawValue) ?? .intake
        let resolvedPriority = WorkflowPriority(rawValue: persistedRecord.priorityRawValue) ?? .standard

        self.init(
            id: persistedRecord.id,
            title: persistedRecord.title,
            clientName: persistedRecord.clientName,
            area: resolvedArea,
            status: resolvedStatus,
            priority: resolvedPriority,
            summary: persistedRecord.summary,
            createdAt: persistedRecord.createdAt,
            updatedAt: persistedRecord.updatedAt,
            tasks: []
        )
    }
}
