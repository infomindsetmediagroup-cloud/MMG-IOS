import Foundation

extension KairosProject {
    init(persistedRecord: PersistedProjectRecord) {
        let resolvedArea = WorkflowArea(rawValue: persistedRecord.areaRawValue) ?? .admin
        let resolvedStatus = WorkflowStatus(rawValue: persistedRecord.statusRawValue) ?? .intake
        let resolvedPriority = WorkflowPriority(rawValue: persistedRecord.priorityRawValue) ?? .standard
        let decodedTasks = persistedRecord.decodedTasks

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
            tasks: decodedTasks
        )
    }
}

extension PersistedProjectRecord {
    var decodedTasks: [KairosTask] {
        guard let data = taskPayload.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([KairosTask].self, from: data)) ?? []
    }

    func updateTasks(_ tasks: [KairosTask]) {
        let data = try? JSONEncoder().encode(tasks)
        taskPayload = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        updatedAt = Date()
    }
}
