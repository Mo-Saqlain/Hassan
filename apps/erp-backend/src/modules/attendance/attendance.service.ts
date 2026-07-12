import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Attendance } from './entities/attendance.entity';
import { UpsertAttendanceDto } from './dto/upsert-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance) private readonly repo: Repository<Attendance>,
  ) {}

  /**
   * Upsert by (employeeId, date) — the user marks attendance daily and
   * may flip the same row from PRESENT to LEAVE etc. without creating
   * duplicate entries.
   */
  async upsert(dto: UpsertAttendanceDto): Promise<Attendance> {
    const existing = await this.repo.findOne({
      where: { employeeId: dto.employeeId, date: dto.date },
    });
    if (existing) {
      Object.assign(existing, dto);
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create(dto));
  }

  findAll(employeeId?: string, from?: string, to?: string) {
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (from && to) where.date = Between(from, to);
    return this.repo.find({
      where,
      order: { date: 'DESC' },
    });
  }

  /** Grid view: one row per employee, one column per day in [from, to]. */
  async grid(from: string, to: string) {
    const rows = await this.repo.find({
      where: { date: Between(from, to) },
      order: { date: 'ASC' },
    });
    return rows;
  }

  async remove(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Attendance ${id} not found`);
    await this.repo.remove(row);
    return { deleted: true, id };
  }

  /** Tally of present / absent / half_day / leave for an employee in a period. */
  async tally(employeeId: string, from: string, to: string) {
    const rows = await this.repo.find({
      where: { employeeId, date: Between(from, to) },
    });
    const out = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0 };
    for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }
}
