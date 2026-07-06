import Foundation

struct KairosRuntimeSnapshot: Codable {
    var state: KairosRuntimeState
    var criticalPath: [KairosRuntimeWorkItem]
    var engineStatuses: [KairosEngineStatus]
    var workflowSteps: [KairosWorkflowStep]
    var operatorActions: [KairosOperatorAction]
    var shopifyWorkspaces: [KairosOperatorAction]
    var shopifyPipeline: [KairosRuntimeWorkItem]
    var productQueue: [KairosProductQueueItem]
    var connectedEngines: [KairosEngineStatus]
    var dailyRun: [KairosWorkflowStep]
    var automationQueue: [KairosRuntimeWorkItem]
    var approvalQueue: [KairosApprovalQueueItem]
    var eventLog: [KairosWorkflowEvent]
}

enum LocalKairosRuntimeStore {
    private static let storageKey = "com.mindsetmediagroup.kairos.runtime.snapshot.v1"

    static func restore() -> KairosRuntime {
        guard
            let data = UserDefaults.standard.data(forKey: storageKey),
            let snapshot = try? JSONDecoder().decode(KairosRuntimeSnapshot.self, from: data)
        else {
            return KairosRuntime()
        }

        let runtime = KairosRuntime(seed: false)
        runtime.apply(snapshot)
        return runtime
    }

    static func save(_ runtime: KairosRuntime) {
        let snapshot = runtime.snapshot()
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }

    static func reset() {
        UserDefaults.standard.removeObject(forKey: storageKey)
    }
}

extension KairosRuntime {
    func snapshot() -> KairosRuntimeSnapshot {
        KairosRuntimeSnapshot(
            state: state,
            criticalPath: criticalPath,
            engineStatuses: engineStatuses,
            workflowSteps: workflowSteps,
            operatorActions: operatorActions,
            shopifyWorkspaces: shopifyWorkspaces,
            shopifyPipeline: shopifyPipeline,
            productQueue: productQueue,
            connectedEngines: connectedEngines,
            dailyRun: dailyRun,
            automationQueue: automationQueue,
            approvalQueue: approvalQueue,
            eventLog: eventLog
        )
    }

    func apply(_ snapshot: KairosRuntimeSnapshot) {
        state = snapshot.state
        criticalPath = snapshot.criticalPath
        engineStatuses = snapshot.engineStatuses
        workflowSteps = snapshot.workflowSteps
        operatorActions = snapshot.operatorActions
        shopifyWorkspaces = snapshot.shopifyWorkspaces
        shopifyPipeline = snapshot.shopifyPipeline
        productQueue = snapshot.productQueue
        connectedEngines = snapshot.connectedEngines
        dailyRun = snapshot.dailyRun
        automationQueue = snapshot.automationQueue
        approvalQueue = snapshot.approvalQueue
        eventLog = snapshot.eventLog
    }
}
