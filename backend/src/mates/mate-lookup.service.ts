import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';
import { modelRows, type DiscoveryDatabase } from './mate-discovery.shared.js';

export interface LookupItem {
  id: number;
  name: string;
}

@Injectable()
export class MateLookupService {
  constructor(@Inject(MATES_DATABASE_TOKEN) private readonly database: DiscoveryDatabase) {}

  async activities(): Promise<LookupItem[]> {
    return this.sorted('Activity');
  }

  async interests(): Promise<LookupItem[]> {
    return this.sorted('Interest');
  }

  async provinces(): Promise<LookupItem[]> {
    return this.sorted('Province');
  }

  async districts(provinceId: number): Promise<LookupItem[]> {
    const provinces = await modelRows(this.database.orm.public.Province, { id: provinceId });
    if (provinces.length === 0) throw new NotFoundException('Province not found');
    const rows = await modelRows(this.database.orm.public.District, { provinceId });
    return this.toSortedItems(rows);
  }

  private async sorted(table: string): Promise<LookupItem[]> {
    return this.toSortedItems(await modelRows(this.database.orm.public[table]));
  }

  private toSortedItems(rows: any[]): LookupItem[] {
    return rows
      .map((row) => ({ id: row.id, name: row.name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}
