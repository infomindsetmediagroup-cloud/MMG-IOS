import Foundation
import Observation

@Observable
final class LocalProjectStore {
    var projects: [KairosProject] = []

    init(seedProjects: [KairosProject] = SampleData.projects) {
        projects = seedProjects
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
    }

    func update(_ project: KairosProject) {
        guard let index = projects.firstIndex(where: { $0.id == project.id }) else { return }
        var updatedProject = project
        updatedProject.updatedAt = Date()
        projects[index] = updatedProject
    }

    func toggleTask(projectID: UUID, taskID: UUID) {
        guard let projectIndex = projects.firstIndex(where: { $0.id == projectID }),
              let taskIndex = projects[projectIndex].tasks.firstIndex(where: { $0.id == taskID }) else { return }

        projects[projectIndex].tasks[taskIndex].isComplete.toggle()
        projects[projectIndex].updatedAt = Date()
    }

    func replaceAll(with newProjects: [KairosProject]) {
        projects = newProjects
    }
}
