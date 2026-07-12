import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './entities/store.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { deleteOrConflict } from '../../common/delete-guard';
import {
  ImportResult,
  bool,
  runImport,
  str,
  validateDto,
} from '../../common/csv-import';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly repo: Repository<Store>,
  ) {}

  create(dto: CreateStoreDto) { return this.repo.save(this.repo.create(dto)); }

  /** Bulk-create from parsed CSV rows. See common/csv-import.ts. */
  async importRows(rows: Record<string, unknown>[]): Promise<ImportResult> {
    return runImport(rows, async (raw) => {
      const dto: CreateStoreDto = {
        name: str(raw.name) as string,
        location: str(raw.location),
        isActive: bool(raw.isActive),
      };
      await validateDto(CreateStoreDto, dto);
      await this.create(dto);
    });
  }

  findAll() { return this.repo.find({ order: { name: 'ASC' } }); }

  async findOne(id: string) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Store ${id} not found`);
    return s;
  }

  async update(id: string, dto: UpdateStoreDto) {
    const s = await this.findOne(id);
    Object.assign(s, dto);
    return this.repo.save(s);
  }

  async remove(id: string) {
    const s = await this.findOne(id);
    return deleteOrConflict(async () => {
      await this.repo.remove(s);
      return { deleted: true, id };
    }, 'store');
  }
}
