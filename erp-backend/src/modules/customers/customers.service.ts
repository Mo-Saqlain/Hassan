import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { deleteOrConflict } from '../../common/delete-guard';

@Injectable()
export class CustomersService implements OnModuleInit {
  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
  ) {}

  async onModuleInit() {
    await this.backfillCodes();
  }

  async create(dto: CreateCustomerDto) {
    const entity = this.repo.create(dto);
    if (!entity.code) entity.code = await this.nextCode();
    return this.repo.save(entity);
  }

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Customer ${id} not found`);
    return c;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const c = await this.findOne(id);
    Object.assign(c, dto);
    return this.repo.save(c);
  }

  async remove(id: string) {
    const c = await this.findOne(id);
    return deleteOrConflict(async () => {
      await this.repo.remove(c);
      return { deleted: true, id };
    }, 'customer');
  }

  private async nextCode(): Promise<string> {
    const count = await this.repo.count();
    return `CUST-${String(count + 1).padStart(6, '0')}`;
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
      row.code = `CUST-${String(n).padStart(6, '0')}`;
    }
    await this.repo.save(missing);
  }
}
