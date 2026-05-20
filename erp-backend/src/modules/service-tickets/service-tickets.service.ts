import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceTicket } from './entities/service-ticket.entity';
import {
  CreateServiceTicketDto,
  UpdateServiceTicketDto,
} from './dto/create-service-ticket.dto';
import { SequenceService } from '../sequences/sequence.service';

@Injectable()
export class ServiceTicketsService {
  constructor(
    @InjectRepository(ServiceTicket)
    private readonly repo: Repository<ServiceTicket>,
    private readonly sequences: SequenceService,
  ) {}

  async create(dto: CreateServiceTicketDto) {
    const ticketNo = await this.sequences.next('SVC', () => this.repo.count());
    const row = this.repo.create({
      ...dto,
      ticketNo,
      receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
      estimatedCompletion: dto.estimatedCompletion
        ? new Date(dto.estimatedCompletion)
        : undefined,
      status: dto.status ?? 'RECEIVED',
    });
    return this.repo.save(row);
  }

  findAll() {
    return this.repo.find({ order: { receivedAt: 'DESC' }, take: 500 });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Service ticket ${id} not found`);
    return row;
  }

  async update(id: string, dto: UpdateServiceTicketDto) {
    const row = await this.findOne(id);
    Object.assign(row, dto);
    if (dto.receivedAt) row.receivedAt = new Date(dto.receivedAt);
    if (dto.estimatedCompletion) {
      row.estimatedCompletion = new Date(dto.estimatedCompletion);
    }
    // Auto-stamp deliveredAt when the workflow flips to DELIVERED so the
    // operator doesn't have to remember a second click.
    if (dto.status === 'DELIVERED' && !row.deliveredAt) {
      row.deliveredAt = new Date();
    }
    return this.repo.save(row);
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    await this.repo.remove(row);
    return { deleted: true, id };
  }

  /** Dashboard counts grouped by status — surfaced as stat tiles. */
  async tally() {
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status')
      .getRawMany<{ status: string; count: string }>();
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = Number(r.count);
    return out;
  }
}
