import Foundation
import Observation

@Observable
final class LocalProjectStore {
    private let storageKey = "kairos.projects.v1"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var projects: [KairosProject] = []

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        load()

        if projects.isEmpty {
            projects = SampleData.projects
            save()
        }
    }

    var activeProjects: [KairosProject] {
        projects.filter { $0.status != .complete }
    }

    var blockedProjects: [KairosProject] {
        projects.filter { $0.status == .blocked }
    }

    func projects(in area: WorkflowArea) -> [KairosProject] {
        projects.filter { $0.area == area }
    }

    func add(_ project: KairosProject) {
        projects.insert(project, at: 0)
        save()
    }

    func update(_ project: KairosProject) {
        guard let index = projects.firstIndex(where: { $0.id == project.id }) else { return }
        var updatedProject = project
        updatedProject.updatedAt = Date()
        projects[index] = updatedProject
        save()
    }

    func toggleTask(projectID: UUID, taskID: UUID) {
        guard let projectIndex = projects.firstIndex(where: { $0.id == projectID }),
              let taskIndex = projects[projectIndex].tasks.firstIndex(where: { $0.id == taskID }) else { return }

        projects[projectIndex].tasks[taskIndex].isComplete.toggle()
        projects[projectIndex].updatedAt = Date()
        save()
    }

    func save() {
        do {
            let data = try encoder.encode(projects)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            assertionFailure("Failed to save Kairos projects: \(error.localizedDescription)")
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }

        do {
            projects = try decoder.decode([KairosProject].self, from: data)
        } catch {
            projects = []
        }
    }
}
