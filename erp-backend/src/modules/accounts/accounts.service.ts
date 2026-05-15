import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Account, AccountCategory, AccountSubType, AccountType } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { deleteOrConflict } from '../../common/delete-guard';
import { SequenceService } from '../sequences/sequence.service';

/**
 * System accounts seeded on first boot. Each is the unique posting target
 * for its category — every sale credits SYSTEM_REVENUE, every purchase debits
 * SYSTEM_INVENTORY, etc. Looked up by `type` (which is unique among system
 * accounts because `isSystem` rows are seeded exactly once).
 */
const SYSTEM_ACCOUNTS: ReadonlyArray<{
  type: AccountType;
  name: string;
  code: string;
  category: AccountCategory;
  subType: AccountSubType;
  parentCode: string;
}> = [
  { type: 'REVENUE',      name: 'Sales Revenue',       code: '4100', category: 'INCOME',    subType: 'OPERATING_INCOME', parentCode: '4000' },
  { type: 'COGS',         name: 'Cost of Goods Sold',  code: '5100', category: 'EXPENSE',   subType: 'COGS',             parentCode: '5000' },
  { type: 'INVENTORY',    name: 'Inventory',           code: '1150', category: 'ASSET',     subType: 'INVENTORY_ASSET',  parentCode: '1100' },
  { type: 'A_R',          name: 'Accounts Receivable', code: '1140', category: 'ASSET',     subType: 'RECEIVABLE',       parentCode: '1100' },
  { type: 'A_P',          name: 'Accounts Payable',    code: '2100', category: 'LIABILITY', subType: 'PAYABLE',          parentCode: '2000' },
  // Unallocated cash receipts (e.g. a POS test without an account picker) land
  // here. The user can rename it but not delete it; the journal still balances.
  { type: 'CASH_ON_HAND', name: 'Cash on Hand',        code: '1110', category: 'ASSET',     subType: 'CURRENT_ASSET',    parentCode: '1100' },
];

/**
 * Top-level control nodes for the chart of accounts. These don't accept
 * postings directly (`isControl=true`); the JournalService rejects lines
 * targeting them. They exist for grouping leaves in reports.
 */
const CONTROL_ACCOUNTS: ReadonlyArray<{
  code: string;
  name: string;
  category: AccountCategory;
  parentCode?: string;
}> = [
  { code: '1000', name: 'Assets',              category: 'ASSET'     },
  { code: '1100', name: 'Current Assets',      category: 'ASSET',     parentCode: '1000' },
  { code: '1200', name: 'Fixed Assets',        category: 'ASSET',     parentCode: '1000' },
  { code: '2000', name: 'Liabilities',         category: 'LIABILITY' },
  { code: '3000', name: 'Equity',              category: 'EQUITY'    },
  { code: '4000', name: 'Revenue',             category: 'INCOME'    },
  { code: '5000', name: 'Cost of Goods Sold',  category: 'EXPENSE'   },
  { code: '6000', name: 'Operating Expenses',  category: 'EXPENSE'   },
];

/** Default category inferred from the user-facing account flavour. */
function categoryForType(type: AccountType): AccountCategory {
  switch (type) {
    case 'CASH':
    case 'BANK':
    case 'WALLET':
    case 'INVENTORY':
    case 'A_R':
    case 'CASH_ON_HAND':
      return 'ASSET';
    case 'CREDIT':
    case 'A_P':
      return 'LIABILITY';
    case 'CAPITAL':
      return 'EQUITY';
    case 'REVENUE':
      return 'INCOME';
    case 'COGS':
      return 'EXPENSE';
  }
}

@Injectable()
export class AccountsService implements OnModuleInit {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
    private readonly sequences: SequenceService,
  ) {}

  async onModuleInit() {
    await this.backfillCodes();
    await this.backfillCategories();
    await this.seedControlAccounts();
    await this.seedSystemAccounts();
  }

  /**
   * Looks up the system account for a given type (REVENUE / COGS / INVENTORY
   * / A_R / A_P). Throws if missing — system accounts are seeded on boot, so
   * a missing one means data corruption, not a normal runtime condition.
   */
  async findSystem(type: AccountType): Promise<Account> {
    const row = await this.repo.findOne({
      where: { type, isSystem: true },
    });
    if (!row) {
      throw new Error(`System account ${type} not seeded — re-run AccountsService.onModuleInit`);
    }
    return row;
  }

  async create(dto: CreateAccountDto) {
    const entity = this.repo.create(dto);
    if (!entity.code) entity.code = await this.nextCode();
    // Derive category from type if the caller didn't supply one — keeps the
    // user-facing CRUD compatible while still tagging every row for reports.
    if (!entity.accountCategory) {
      entity.accountCategory = categoryForType(entity.type ?? 'CASH');
    }
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
    if (a.isSystem) {
      throw new BadRequestException(
        `${a.name} is a system account — it cannot be deleted. Rename if needed.`,
      );
    }
    return deleteOrConflict(async () => {
      await this.repo.remove(a);
      return { deleted: true, id };
    }, 'account');
  }

  private async nextCode(): Promise<string> {
    return this.sequences.next('ACC', () => this.repo.count());
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

  /**
   * Backfills `accountCategory` on rows persisted before the column existed.
   * The default value (`ASSET`) on the column would leave Capital → ASSET and
   * Credit → ASSET, which would silently break the Balance Sheet on the
   * journal-driven reports.
   */
  private async backfillCategories() {
    // Find rows where the category column doesn't match what the type implies.
    const all = await this.repo.find();
    const stale = all.filter(
      (a) => a.accountCategory !== categoryForType(a.type ?? 'CASH'),
    );
    if (stale.length === 0) return;
    for (const row of stale) {
      row.accountCategory = categoryForType(row.type ?? 'CASH');
    }
    await this.repo.save(stale);
  }

  /**
   * Idempotently creates the chart-of-accounts control nodes on first boot.
   * They're keyed by `code`, so re-runs short-circuit; the parent link is
   * patched on a second pass once every node exists.
   */
  private async seedControlAccounts() {
    // Phase 1: ensure every control row exists (without parent links yet).
    for (const ctl of CONTROL_ACCOUNTS) {
      const existing = await this.repo.findOne({ where: { code: ctl.code } });
      if (existing) continue;
      await this.repo.save(
        this.repo.create({
          code: ctl.code,
          name: ctl.name,
          type: 'CASH', // unused for control rows
          accountCategory: ctl.category,
          isControl: true,
          isSystem: true,
          openingBalance: 0,
          isActive: true,
        }),
      );
    }
    // Phase 2: patch parent links.
    for (const ctl of CONTROL_ACCOUNTS) {
      if (!ctl.parentCode) continue;
      const row = await this.repo.findOne({ where: { code: ctl.code } });
      if (!row) continue;
      if (row.parentAccountId) continue;
      const parent = await this.repo.findOne({ where: { code: ctl.parentCode } });
      if (!parent) continue;
      row.parentAccountId = parent.id;
      await this.repo.save(row);
    }
  }

  /**
   * Idempotently creates the six system accounts on first boot and links
   * them to their parent control accounts. Looking up by (type,
   * isSystem=true) means re-runs are no-ops and never duplicate.
   */
  private async seedSystemAccounts() {
    for (const sys of SYSTEM_ACCOUNTS) {
      const parent = await this.repo.findOne({ where: { code: sys.parentCode } });
      let row = await this.repo.findOne({
        where: { type: sys.type, isSystem: true },
      });
      if (!row) {
        row = this.repo.create({
          name: sys.name,
          type: sys.type,
          code: sys.code,
          accountCategory: sys.category,
          accountSubType: sys.subType,
          isSystem: true,
          openingBalance: 0,
          isActive: true,
        });
      }
      // Backfill subType + parent link for existing rows that were seeded
      // before the hierarchy columns existed.
      if (!row.accountSubType) row.accountSubType = sys.subType;
      if (!row.parentAccountId && parent) row.parentAccountId = parent.id;
      await this.repo.save(row);
    }
  }
}
