export interface TenantOwnedRecord {
  id: string;
  tenantId: string;
}

export interface PlatformRepository<TRecord extends TenantOwnedRecord> {
  get(tenantId: string, id: string): Promise<TRecord | null>;
  list(tenantId: string): Promise<TRecord[]>;
  save(record: TRecord): Promise<TRecord>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export class InMemoryPlatformRepository<TRecord extends TenantOwnedRecord>
  implements PlatformRepository<TRecord> {
  private readonly records = new Map<string, TRecord>();

  async get(tenantId: string, id: string): Promise<TRecord | null> {
    const record = this.records.get(this.key(tenantId, id));
    return record ? structuredClone(record) : null;
  }

  async list(tenantId: string): Promise<TRecord[]> {
    return [...this.records.values()]
      .filter(record => record.tenantId === tenantId)
      .map(record => structuredClone(record));
  }

  async save(record: TRecord): Promise<TRecord> {
    const copy = structuredClone(record);
    this.records.set(this.key(record.tenantId, record.id), copy);
    return structuredClone(copy);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    return this.records.delete(this.key(tenantId, id));
  }

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }
}
