import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './entities/brand.entity';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { deleteOrConflict } from '../../common/delete-guard';
import {
  ImportResult,
  bool,
  runImport,
  str,
  validateDto,
} from '../../common/csv-import';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly repo: Repository<Brand>,
  ) {}

  create(dto: CreateBrandDto) {
    const brand = this.repo.create(dto);
    return this.repo.save(brand);
  }

  /** Bulk-create from parsed CSV rows. See common/csv-import.ts. */
  async importRows(rows: Record<string, unknown>[]): Promise<ImportResult> {
    return runImport(rows, async (raw) => {
      const dto: CreateBrandDto = {
        name: str(raw.name) as string,
        description: str(raw.description),
        isActive: bool(raw.isActive),
      };
      await validateDto(CreateBrandDto, dto);
      await this.create(dto);
    });
  }

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const brand = await this.repo.findOne({ where: { id } });
    if (!brand) throw new NotFoundException(`Brand ${id} not found`);
    return brand;
  }

  async update(id: string, dto: UpdateBrandDto) {
    const brand = await this.findOne(id);
    Object.assign(brand, dto);
    return this.repo.save(brand);
  }

  async remove(id: string) {
    const brand = await this.findOne(id);
    return deleteOrConflict(async () => {
      await this.repo.remove(brand);
      return { deleted: true, id };
    }, 'brand');
  }
}
