import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { deleteOrConflict } from '../../common/delete-guard';
import { SequenceService } from '../sequences/sequence.service';

@Injectable()
export class SuppliersService implements OnModuleInit {
  constructor(
    @InjectRepository(Supplier)
    private readonly repo: Repository<Supplier>,
    private readonly sequences: SequenceService,
  ) {}

  async onModuleInit() {
    await this.backfillCodes();
  }

  async create(dto: CreateSupplierDto) {
    const entity = this.repo.create(dto);
    if (!entity.code) entity.code = await this.nextCode();
    return this.repo.save(entity);
  }

  findAll() { return this.repo.find({ order: { name: 'ASC' } }); }

  async findOne(id: string) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Supplier ${id} not found`);
    return s;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const s = await this.findOne(id);
    Object.assign(s, dto);
    return this.repo.save(s);
  }

  async remove(id: string) {
    const s = await this.findOne(id);
    return deleteOrConflict(async () => {
      await this.repo.remove(s);
      return { deleted: true, id };
    }, 'supplier');
  }

  private async nextCode(): Promise<string> {
    return this.sequences.next('SUPP', () => this.repo.count());
  }

  private async backfillCodes() {
    const missing = await this.repo.find({
      where: { code: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (missing.length === 0) return;
    const total = await this.repo.count();
    let n = total - missing.length;
    for (const row of missing) {
      n += 1;
      row.code = `SUPP-${String(n).padStart(6, '0')}`;
    }
    await this.repo.save(missing);
  }
}
