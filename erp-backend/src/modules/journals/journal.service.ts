import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { JournalEntry, JournalSourceModule } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { SequenceService } from '../sequences/sequence.service';
import { PeriodsService } from '../periods/periods.service';
import { Account } from '../accounts/entities/account.entity';
import { In } from 'typeorm';

export interface JournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  narration?: string;
}

export interface PostJournalInput {
  entryDate: Date;
  sourceModule: JournalSourceModule;
  sourceRef?: string;
  description?: string;
  lines: JournalLineInput[];
  /** When set, the new entry is a reversal of this entry id. */
  reversesJournalEntryId?: string;
}

/** Allowed cent-precision rounding tolerance when comparing Dr / Cr totals. */
const BALANCE_TOLERANCE = 0.005;

@Injectable()
export class JournalService {
  constructor(
    @InjectRepository(JournalEntry)
    private readonly entries: Repository<JournalEntry>,
    @InjectRepository(JournalLine)
    private readonly lines: Repository<JournalLine>,
    private readonly sequences: SequenceService,
    private readonly periods: PeriodsService,
  ) {}

  /**
   * Posts a balanced journal entry inside the caller-supplied transaction
   * (`manager`), or starts its own if no manager is provided. Every business
   * write should call this in the same TypeORM transaction as the source row
   * so the journal can't drift from operational tables.
   *
   * Enforced invariants:
   *   1. Each line has exactly one of (debit > 0) or (credit > 0).
   *   2. `SUM(debit) === SUM(credit)` within `BALANCE_TOLERANCE` rupees.
   *   3. `entryDate` falls within a period that is not HARD_CLOSED.
   *      (SOFT_CLOSED periods accept posts; HARD_CLOSED reject.)
   */
  async post(
    input: PostJournalInput,
    manager?: EntityManager,
  ): Promise<JournalEntry> {
    if (input.lines.length < 2) {
      throw new BadRequestException(
        'Journal entry needs at least two lines (one Dr, one Cr).',
      );
    }

    let dr = 0;
    let cr = 0;
    for (const ln of input.lines) {
      const d = Number(ln.debit ?? 0);
      const c = Number(ln.credit ?? 0);
      if (d < 0 || c < 0) {
        throw new BadRequestException('Journal line debit/credit cannot be negative.');
      }
      if (d > 0 && c > 0) {
        throw new BadRequestException(
          'Journal line cannot carry both a debit and a credit.',
        );
      }
      if (d === 0 && c === 0) {
        throw new BadRequestException('Journal line must have either a debit or a credit.');
      }
      dr += d;
      cr += c;
    }
    if (Math.abs(dr - cr) > BALANCE_TOLERANCE) {
      throw new BadRequestException(
        `Journal entry unbalanced: Dr ${dr.toFixed(2)} ≠ Cr ${cr.toFixed(2)}.`,
      );
    }

    // Period check — reject HARD_CLOSED, allow SOFT_CLOSED/OPEN. Reversals
    // bypass the soft-close warning because they're correcting an error,
    // but never bypass HARD_CLOSED.
    await this.periods.assertOpen(input.entryDate);

    // Reject postings to control accounts (grouping nodes that aren't
    // postable). Cheap one-shot lookup of every line's accountId.
    const targetIds = Array.from(new Set(input.lines.map((l) => l.accountId)));
    const targets = await this.entries.manager
      .getRepository(Account)
      .find({ where: { id: In(targetIds) } });
    const byId = new Map(targets.map((a) => [a.id, a]));
    for (const ln of input.lines) {
      const acc = byId.get(ln.accountId);
      if (!acc) {
        throw new BadRequestException(`Journal line references unknown account ${ln.accountId}.`);
      }
      if (acc.isControl) {
        throw new BadRequestException(
          `Cannot post to control account "${acc.name}" (${acc.code}). Post to one of its leaf children instead.`,
        );
      }
    }

    const entryNumber = await this.sequences.next('JE');

    const run = async (m: EntityManager) => {
      const entryRepo = m.getRepository(JournalEntry);
      const lineRepo = m.getRepository(JournalLine);
      const entry = entryRepo.create({
        entryNumber,
        entryDate: input.entryDate,
        sourceModule: input.sourceModule,
        sourceRef: input.sourceRef,
        description: input.description,
        reversesJournalEntryId: input.reversesJournalEntryId,
      });
      const persistedEntry = await entryRepo.save(entry);
      const lines = input.lines.map((ln) =>
        lineRepo.create({
          entryId: persistedEntry.id,
          accountId: ln.accountId,
          debit: Number((ln.debit ?? 0).toFixed(2)),
          credit: Number((ln.credit ?? 0).toFixed(2)),
          narration: ln.narration,
        }),
      );
      await lineRepo.save(lines);
      persistedEntry.lines = lines;
      return persistedEntry;
    };

    if (manager) return run(manager);
    return this.entries.manager.transaction((tx) => run(tx));
  }

  /**
   * Posts a balancing reversal — every line's sign is flipped and the new
   * entry is tagged `reversesJournalEntryId = source.id`. Idempotent: a
   * second call against the same source returns the existing reversal.
   */
  async reverse(
    sourceEntryId: string,
    opts: { entryDate?: Date; description?: string; reason?: string },
    manager?: EntityManager,
  ): Promise<JournalEntry> {
    const m = manager ?? this.entries.manager;
    const existing = await m.getRepository(JournalEntry).findOne({
      where: { reversesJournalEntryId: sourceEntryId },
      relations: ['lines'],
    });
    if (existing) return existing;

    const source = await m.getRepository(JournalEntry).findOne({
      where: { id: sourceEntryId },
      relations: ['lines'],
    });
    if (!source) {
      throw new BadRequestException(`Journal entry ${sourceEntryId} not found.`);
    }
    const flipped: JournalLineInput[] = source.lines.map((ln) => ({
      accountId: ln.accountId,
      debit: Number(ln.credit),
      credit: Number(ln.debit),
      narration: `Reversal · ${ln.narration ?? ''}`.trim(),
    }));
    return this.post(
      {
        entryDate: opts.entryDate ?? new Date(),
        sourceModule: 'REVERSAL',
        sourceRef: source.sourceRef,
        description: opts.description ?? `Reversal of ${source.entryNumber}${opts.reason ? ` · ${opts.reason}` : ''}`,
        reversesJournalEntryId: source.id,
        lines: flipped,
      },
      manager,
    );
  }

  /** Convenience: find the entry produced by a given source (e.g. an INV-…). */
  findBySource(sourceModule: JournalSourceModule, sourceRef: string) {
    return this.entries.findOne({
      where: { sourceModule, sourceRef },
      relations: ['lines'],
    });
  }
}
