import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { CashEntry } from './entities/cash-entry.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';
import { CreateCashEntryDto } from './dto/create-cash-entry.dto';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { Sale } from '../sales/entities/sale.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Account } from '../accounts/entities/account.entity';
import { FundTransfersService } from '../fund-transfers/fund-transfers.service';
import { FundTransfer } from '../fund-transfers/entities/fund-transfer.entity';

/**
 * If MISC entries on a day exceed this fraction of total cash-book movement,
 * the day's report surfaces a warning. Tuned for a small home-appliances
 * shop — anything over ~10% of throughput as "unclassified" should get a
 * second look from the cashier.
 */
const MISC_WARN_RATIO = 0.1;

/** Absolute floor so a tiny day with one Rs.500 misc doesn't trip the ratio. */
const MISC_WARN_FLOOR = 1000;

@Injectable()
export class CashRegisterService {
  constructor(
    @InjectRepository(CashEntry)
    private readonly repo: Repository<CashEntry>,
    @InjectRepository(CashRegisterSession)
    private readonly sessions: Repository<CashRegisterSession>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(Sale)
    private readonly sales: Repository<Sale>,
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(FundTransfer)
    private readonly transferRepo: Repository<FundTransfer>,
    private readonly fundTransfers: FundTransfersService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Cash entries ────────────────────────────────────────────────────

  async create(dto: CreateCashEntryDto): Promise<CashEntry> {
    const entryDate = dto.entryDate ?? today();
    return this.repo.save(this.repo.create({ ...dto, entryDate }));
  }

  findAll(from?: string, to?: string) {
    const where =
      from && to
        ? { entryDate: Between(from, to) }
        : from
        ? { entryDate: Between(from, today()) }
        : {};
    return this.repo.find({ where, order: { entryDate: 'DESC', createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Cash entry ${id} not found`);
    return e;
  }

  async remove(id: string) {
    const e = await this.findOne(id);
    await this.repo.remove(e);
    return { deleted: true, id };
  }

  // ─── Sessions ────────────────────────────────────────────────────────

  /**
   * Open today's (or a given date's) cash register session. Computes the
   * expected opening from cash-on-hand at end of the prior day, takes the
   * cashier's actual count, and optionally books a fund transfer in the
   * same atomic operation if the cashier needs to top up the till from
   * another account (e.g., Capital → Cash) to cover a shortfall.
   */
  async openSession(dto: OpenSessionDto) {
    const sessionDate = dto.sessionDate ?? today();
    const existing = await this.sessions.findOne({ where: { sessionDate } });
    if (existing) {
      throw new BadRequestException(
        `Cash register session already exists for ${sessionDate} (status: ${existing.status})`,
      );
    }
    const expectedOpening = await this.cashOnHandAsOf(prevDay(sessionDate));

    return this.dataSource.transaction(async (manager) => {
      let openingTransferId: string | undefined;
      if (dto.transfer) {
        const t = await this.fundTransfers.create({
          fromAccountId: dto.transfer.fromAccountId,
          toAccountId: dto.transfer.toAccountId,
          amount: dto.transfer.amount,
          transferDate: sessionDate,
          notes:
            dto.transfer.notes ??
            `Opening top-up for cash register ${sessionDate}`,
        });
        openingTransferId = t.id;
      }
      const sessionRepo = manager.getRepository(CashRegisterSession);
      const session = sessionRepo.create({
        sessionDate,
        status: 'OPEN',
        expectedOpening: round(expectedOpening),
        actualOpening: round(dto.actualOpening),
        openingDifference: round(dto.actualOpening - expectedOpening),
        openingTransferId,
        openedAt: new Date(),
        notes: dto.notes,
      });
      return sessionRepo.save(session);
    });
  }

  async closeSession(sessionDate: string, dto: CloseSessionDto) {
    const session = await this.sessions.findOne({ where: { sessionDate } });
    if (!session) {
      throw new NotFoundException(
        `No session found for ${sessionDate}`,
      );
    }
    if (session.status === 'CLOSED') {
      throw new BadRequestException(
        `Session for ${sessionDate} is already closed`,
      );
    }
    const expectedClosing = await this.expectedClosingFor(sessionDate);
    session.expectedClosing = round(expectedClosing);
    session.actualClosing = round(dto.actualClosing);
    session.closingDifference = round(dto.actualClosing - expectedClosing);
    session.status = 'CLOSED';
    session.closedAt = new Date();
    if (dto.notes) {
      session.notes = (session.notes ? session.notes + '\n' : '') + dto.notes;
    }
    return this.sessions.save(session);
  }

  getSession(sessionDate: string) {
    return this.sessions.findOne({ where: { sessionDate } });
  }

  /**
   * Status for a date: is a session open/closed/missing? What's the
   * expected opening if we were to open one right now?
   */
  async sessionStatus(sessionDate?: string) {
    const day = sessionDate ?? today();
    const session = await this.sessions.findOne({ where: { sessionDate: day } });
    const expectedOpening = await this.cashOnHandAsOf(prevDay(day));
    return {
      date: day,
      session,
      expectedOpening: round(expectedOpening),
    };
  }

  listSessions(from?: string, to?: string) {
    const where =
      from && to ? { sessionDate: Between(from, to) } : {};
    return this.sessions.find({
      where,
      order: { sessionDate: 'DESC' },
    });
  }

  // ─── Daily book ──────────────────────────────────────────────────────

  /**
   * Daily cash book — combines explicit cash entries with sales/purchases/
   * payments tagged as CASH so the cashier sees one consolidated view of
   * everything that hit the till on a given date. Opening balance uses the
   * session's actualOpening if a session exists, otherwise computes from
   * the prior day's closing.
   */
  async dailyBook(date?: string) {
    const day = date ?? today();
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(`${day}T23:59:59.999Z`);

    // Fan everything out in parallel. Previously these eight reads were
    // serialised, which over the Supabase pooler meant ~4 s of round-trip
    // latency even on an empty day. Concurrent dispatch collapses it to
    // roughly the slowest single query.
    const cashAccounts = await this.accounts.find({ where: { type: 'CASH' } });
    const cashAccountIds = new Set(cashAccounts.map((a) => a.id));
    const cashIdsArr = [...cashAccountIds];

    const [
      session,
      entries,
      salesOnDay,
      purchasesOnDay,
      vouchers,
      cashTransfers,
      expectedOpening,
    ] = await Promise.all([
      this.sessions.findOne({ where: { sessionDate: day } }),
      this.repo.find({
        where: { entryDate: day },
        order: { createdAt: 'ASC' },
      }),
      this.sales.find({ where: { createdAt: Between(start, end) } }),
      this.purchases.find({ where: { createdAt: Between(start, end) } }),
      this.payments.find({ where: { createdAt: Between(start, end) } }),
      this.fundTransfers.findInvolvingAccounts(cashIdsArr, start, end),
      this.cashOnHandAsOf(prevDay(day), cashAccounts),
    ]);

    const cashSales = salesOnDay.filter(
      (s) => s.paymentMethod === 'CASH' && Number(s.paidAmount ?? 0) > 0,
    );
    const cashPurchases = purchasesOnDay.filter(
      (p) => p.paymentMethod === 'CASH' && Number(p.paidAmount ?? 0) > 0,
    );
    const cashVouchers = vouchers.filter((v) =>
      cashAccountIds.has(v.accountId),
    );

    // Opening: session value if a session exists for this date; otherwise
    // computed from prior-day closing.
    const opening = session
      ? Number(session.actualOpening)
      : expectedOpening;

    const lines: Array<{
      time: Date;
      ref: string;
      type: string;
      category: string;
      description: string;
      direction: 'IN' | 'OUT';
      amount: number;
      source: 'CASH_ENTRY' | 'SALE' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT' | 'TRANSFER';
      sourceId: string;
    }> = [];

    for (const e of entries) {
      lines.push({
        time: e.createdAt,
        ref: e.id.slice(0, 8),
        type: e.category,
        category: e.category,
        description: e.description ?? '',
        direction: e.direction,
        amount: Number(e.amount),
        source: 'CASH_ENTRY',
        sourceId: e.id,
      });
    }
    for (const s of cashSales) {
      lines.push({
        time: new Date(s.createdAt),
        ref: s.invoiceNo,
        type: 'SALE',
        category: 'SALE',
        description: `Cash sale ${s.invoiceNo}`,
        direction: 'IN',
        amount: Number(s.paidAmount ?? 0),
        source: 'SALE',
        sourceId: s.id,
      });
    }
    for (const p of cashPurchases) {
      lines.push({
        time: new Date(p.createdAt),
        ref: p.billNo,
        type: 'PURCHASE',
        category: 'PURCHASE',
        description: `Cash purchase ${p.billNo}`,
        direction: 'OUT',
        amount: Number(p.paidAmount ?? 0),
        source: 'PURCHASE',
        sourceId: p.id,
      });
    }
    for (const v of cashVouchers) {
      lines.push({
        time: new Date(v.createdAt),
        ref: v.voucherNo,
        type: v.direction === 'IN' ? 'RECEIPT' : 'PAYMENT',
        category: v.direction === 'IN' ? 'RECEIPT' : 'PAYMENT',
        description: v.notes ?? `${v.direction === 'IN' ? 'Receipt' : 'Payment'} voucher ${v.voucherNo}`,
        direction: v.direction,
        amount: Number(v.amount),
        source: v.direction === 'IN' ? 'RECEIPT' : 'PAYMENT',
        sourceId: v.id,
      });
    }
    for (const t of cashTransfers) {
      const cashIn = cashAccountIds.has(t.toAccountId);
      const cashOut = cashAccountIds.has(t.fromAccountId);
      // Inter-cash transfers cancel out for the till, so skip them.
      if (cashIn && cashOut) continue;
      const direction: 'IN' | 'OUT' = cashIn ? 'IN' : 'OUT';
      const counter = cashIn ? t.fromAccount?.name : t.toAccount?.name;
      lines.push({
        time: new Date(t.createdAt),
        ref: t.transferNo,
        type: 'TRANSFER',
        category: 'TRANSFER',
        description: `Transfer ${cashIn ? 'from' : 'to'} ${counter ?? '—'}`,
        direction,
        amount: Number(t.amount),
        source: 'TRANSFER',
        sourceId: t.id,
      });
    }

    lines.sort((a, b) => a.time.getTime() - b.time.getTime());

    let running = opening;
    const rows = lines.map((l) => {
      running = l.direction === 'IN' ? running + l.amount : running - l.amount;
      return { ...l, runningBalance: round(running) };
    });

    const totalIn = round(
      rows.filter((r) => r.direction === 'IN').reduce((s, r) => s + r.amount, 0),
    );
    const totalOut = round(
      rows.filter((r) => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0),
    );
    const miscTotal = round(
      rows
        .filter((r) => r.category === 'MISC')
        .reduce((s, r) => s + r.amount, 0),
    );
    const throughput = totalIn + totalOut;
    const miscWarning =
      miscTotal >= MISC_WARN_FLOOR &&
      throughput > 0 &&
      miscTotal / throughput > MISC_WARN_RATIO
        ? {
            message: `Miscellaneous entries (${miscTotal.toFixed(2)}) are ${(
              (miscTotal / throughput) *
              100
            ).toFixed(1)}% of today's cash movement — please review for missed categorisation.`,
            miscTotal,
            throughput,
            ratio: miscTotal / throughput,
            threshold: MISC_WARN_RATIO,
          }
        : null;

    return {
      date: day,
      session,
      expectedOpening: round(expectedOpening),
      opening: round(opening),
      entries: rows,
      totals: {
        in: totalIn,
        out: totalOut,
        net: round(totalIn - totalOut),
        miscTotal,
      },
      closing: round(opening + totalIn - totalOut),
      warnings: miscWarning ? [miscWarning] : [],
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /**
   * Cumulative cash on hand at end-of-day for the given date. Includes
   * account opening balances, all cash-tagged sale/purchase/voucher activity,
   * explicit cash-book entries, and fund-transfer inflows/outflows.
   *
   * Pass `preloadedAccounts` to skip an extra round-trip when the caller
   * already has the list (e.g. `dailyBook`).
   */
  private async cashOnHandAsOf(
    dateInclusive: string | null,
    preloadedAccounts?: Account[],
  ): Promise<number> {
    const cashAccounts =
      preloadedAccounts ??
      (await this.accounts.find({ where: { type: 'CASH' } }));
    const opening = cashAccounts.reduce(
      (s, a) => s + Number(a.openingBalance ?? 0),
      0,
    );
    if (!dateInclusive) return opening;

    const cashIds = cashAccounts.map((a) => a.id);
    const end = new Date(`${dateInclusive}T23:59:59.999Z`);

    const [salesIn, purchasesOut, voucherIn, voucherOut, entryIn, entryOut, transferDelta] =
      await Promise.all([
        this.sales
          .createQueryBuilder('s')
          .where('s.payment_method = :m', { m: 'CASH' })
          .andWhere('s.created_at <= :end', { end })
          .select('COALESCE(SUM(s.paid_amount), 0)', 'sum')
          .getRawOne(),
        this.purchases
          .createQueryBuilder('p')
          .where('p.payment_method = :m', { m: 'CASH' })
          .andWhere('p.created_at <= :end', { end })
          .select('COALESCE(SUM(p.paid_amount), 0)', 'sum')
          .getRawOne(),
        cashIds.length === 0
          ? Promise.resolve(null)
          : this.payments
              .createQueryBuilder('p')
              .where('p.direction = :d', { d: 'IN' })
              .andWhere('p.account_id IN (:...ids)', { ids: cashIds })
              .andWhere('p.created_at <= :end', { end })
              .select('COALESCE(SUM(p.amount), 0)', 'sum')
              .getRawOne(),
        cashIds.length === 0
          ? Promise.resolve(null)
          : this.payments
              .createQueryBuilder('p')
              .where('p.direction = :d', { d: 'OUT' })
              .andWhere('p.account_id IN (:...ids)', { ids: cashIds })
              .andWhere('p.created_at <= :end', { end })
              .select('COALESCE(SUM(p.amount), 0)', 'sum')
              .getRawOne(),
        this.repo
          .createQueryBuilder('e')
          .where('e.direction = :d', { d: 'IN' })
          .andWhere('e.entry_date <= :d2', { d2: dateInclusive })
          .select('COALESCE(SUM(e.amount), 0)', 'sum')
          .getRawOne(),
        this.repo
          .createQueryBuilder('e')
          .where('e.direction = :d', { d: 'OUT' })
          .andWhere('e.entry_date <= :d2', { d2: dateInclusive })
          .select('COALESCE(SUM(e.amount), 0)', 'sum')
          .getRawOne(),
        this.fundTransfers.groupDeltaAt(cashIds, end),
      ]);

    return (
      opening +
      Number(salesIn?.sum ?? 0) -
      Number(purchasesOut?.sum ?? 0) +
      Number(voucherIn?.sum ?? 0) -
      Number(voucherOut?.sum ?? 0) +
      Number(entryIn?.sum ?? 0) -
      Number(entryOut?.sum ?? 0) +
      transferDelta
    );
  }

  /**
   * Expected closing cash for a session: opening (actual) + same-day IN - OUT.
   * Reuses dailyBook's running balance logic indirectly via direct sums.
   */
  private async expectedClosingFor(sessionDate: string): Promise<number> {
    const book = await this.dailyBook(sessionDate);
    return book.opening + book.totals.in - book.totals.out;
  }

  /** Summary across a date range — useful for reconciliation. */
  async summary(from: string, to: string) {
    const days: string[] = [];
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    const books = await Promise.all(days.map((d) => this.dailyBook(d)));
    const rows = books.map((book, i) => ({
      date: days[i],
      opening: book.opening,
      in: book.totals.in,
      out: book.totals.out,
      miscTotal: book.totals.miscTotal,
      closing: book.closing,
      warned: book.warnings.length > 0,
    }));
    return { from, to, rows };
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function prevDay(d: string): string | null {
  const date = new Date(d);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
