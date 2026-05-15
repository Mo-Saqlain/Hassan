import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { deleteOrConflict } from '../../common/delete-guard';
import { SequenceService } from '../sequences/sequence.service';

@Injectable()
export class EmployeesService implements OnModuleInit {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
    private readonly sequences: SequenceService,
  ) {}

  async onModuleInit() {
    await this.backfillCodes();
  }

  async create(dto: CreateEmployeeDto) {
    const entity = this.repo.create(dto);
    if (!entity.code) entity.code = await this.nextCode();
    return this.repo.save(entity);
  }

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Employee ${id} not found`);
    return e;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const e = await this.findOne(id);
    Object.assign(e, dto);
    return this.repo.save(e);
  }

  async remove(id: string) {
    const e = await this.findOne(id);
    return deleteOrConflict(async () => {
      await this.repo.remove(e);
      return { deleted: true, id };
    }, 'employee');
  }

  private async nextCode(): Promise<string> {
    return this.sequences.next('EMP', () => this.repo.count());
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
      row.code = `EMP-${String(n).padStart(6, '0')}`;
    }
    await this.repo.save(missing);
  }
}
