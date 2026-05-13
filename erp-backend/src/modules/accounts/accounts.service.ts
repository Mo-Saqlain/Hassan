import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { deleteOrConflict } from '../../common/delete-guard';

@Injectable()
export class AccountsService implements OnModuleInit {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
  ) {}

  async onModuleInit() {
    await this.backfillCodes();
  }

  async create(dto: CreateAccountDto) {
    const entity = this.repo.create(dto);
    if (!entity.code) entity.code = await this.nextCode();
    return this.repo.save(entity);
  }

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Account ${id} not found`);
    return a;
  }

  async update(id: string, dto: UpdateAccountDto) {
    const a = await this.findOne(id);
    Object.assign(a, dto);
    return this.repo.save(a);
  }

  async remove(id: string) {
    const a = await this.findOne(id);
    return deleteOrConflict(async () => {
      await this.repo.remove(a);
      return { deleted: true, id };
    }, 'account');
  }

  private async nextCode(): Promise<string> {
    const count = await this.repo.count();
    return `ACC-${String(count + 1).padStart(6, '0')}`;
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
      row.code = `ACC-${String(n).padStart(6, '0')}`;
    }
    await this.repo.save(missing);
  }
}
