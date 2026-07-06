import Foundation

extension PersistedProjectRecord {
    convenience init(project: KairosProject) {
        self.init(
            id: project.id,
            title: project.title,
            clientName: project.clientName,
            areaRawValue: project.area.rawValue,
            statusRawValue: project.status.rawValue,
            priorityRawValue: project.priority.rawValue,
            summary: project.summary
        )
    }
}

extension PersistedCustomerRequestRecord {
    convenience init(request: CustomerPortalRequest) {
        self.init(
            id: request.id,
            customerName: request.customerName,
            email: request.email,
            requestTypeRawValue: request.requestType.rawValue,
            statusRawValue: request.status.rawValue,
            subject: request.subject,
            message: request.message,
            createdAt: request.createdAt,
            updatedAt: request.createdAt
        )
    }
}

extension PersistedPublishingAssetRecord {
    convenience init(asset: PublishingAsset) {
        self.init(
            id: asset.id,
            title: asset.title,
            assetTypeRawValue: asset.assetType.rawValue,
            statusRawValue: asset.status.rawValue,
            owner: asset.owner,
            canonicalPath: asset.canonicalPath,
            summary: asset.summary,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt
        )
    }
}

extension PersistedReleasePackageRecord {
    convenience init(package: ReleasePackage) {
        self.init(
            id: package.id,
            title: package.title,
            statusRawValue: package.status.rawValue,
            summary: package.summary,
            customerImpact: package.customerImpact,
            internalNotes: package.internalNotes,
            validationSummary: package.validationSummary,
            createdAt: package.createdAt,
            updatedAt: package.updatedAt
        )
    }
}

extension PersistedCampaignRecord {
    convenience init(campaign: Campaign) {
        self.init(
            id: campaign.id,
            title: campaign.title,
            statusRawValue: campaign.status.rawValue,
            channelRawValue: campaign.channel.rawValue,
            audienceRawValue: campaign.audience.rawValue,
            objective: campaign.objective,
            offer: campaign.offer,
            landingPagePath: campaign.landingPagePath,
            requiresApproval: campaign.requiresApproval,
            approvedBy: campaign.approvedBy,
            scheduledAt: campaign.scheduledAt,
            createdAt: campaign.createdAt,
            updatedAt: campaign.updatedAt
        )
    }
}
