import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThanOrEqual, Repository } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { PurchaseItem } from '../purchases/entities/purchase-item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { PurchaseReturn } from '../returns/entities/purchase-return.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Account } from '../accounts/entities/account.entity';
import { Item } from '../items/entities/item.entity';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { IncentivesService } from '../incentives/incentives.service';
import { FundTransfersService } from '../fund-transfers/fund-transfers.service';

type LedgerEntry = {
  date: Date;
  ref: string;
  refId: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Supplier) private readonly suppliers: Repository<Supplier>,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(SaleItem) private readonly saleItems: Repository<SaleItem>,
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>,
    @InjectRepository(PurchaseItem) private readonly purchaseItems: Repository<PurchaseItem>,
    @InjectRepository(SaleReturn) private readonly saleReturns: Repository<SaleReturn>,
    @InjectRepository(PurchaseReturn) private readonly purchaseReturns: Repository<PurchaseReturn>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(StockMovement) private readonly movements: Repository<StockMovement>,
    private readonly incentives: IncentivesService,
    private readonly transfers: FundTransfersService,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Customer ledger + balance (A/R)
  // ──────────────────────────────────────────────────────────

  async customerLedger(customerId: string, asOf?: Date) {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    const opening = Number(customer.openingBalance ?? 0);
    const dateClause = asOf ? { createdAt: LessThanOrEqual(asOf) } : {};
    const sales = await this.sales.find({ where: { customerId, ...dateClause } });
    const returns = await this.saleReturns.find({
      where: { customerId, ...dateClause },
    });
    const receipts = await this.payments.find({
      where: { customerId, direction: 'IN', ...dateClause },
    });

    const all: Array<{
      date: Date;
      ref: string;
      refId: string;
      type: string;
      description: string;
      debit: number;
      credit: number;
    }> = [];

    for (const s of sales) {
      all.push({
        date: new Date(s.createdAt),
        ref: s.invoiceNo,
        refId: s.id,
        type: 'SALE',
        description: `Sale invoice ${s.invoiceNo} (${s.paymentMethod})`,
        debit: Number(s.netAmount),
        credit: 0,
      });
      // Cash/Card/Bank paid at sale time reduces A/R immediately.
      const paid = Number(s.paidAmount ?? 0);
      if (paid > 0) {
        all.push({
          date: new Date(s.createdAt),
          ref: s.invoiceNo,
          refId: s.id,
          type: 'PAID_AT_SALE',
          description: `Paid at sale (${s.paymentMethod})`,
          debit: 0,
          credit: paid,
        });
      }
    }
    for (const r of returns) {
      all.push({
        date: new Date(r.createdAt),
        ref: r.returnNo,
        refId: r.id,
        type: 'SALE_RETURN',
        description: `Sale return ${r.returnNo}`,
        debit: 0,
        credit: Number(r.totalAmount),
      });
    }
    for (const p of receipts) {
      all.push({
        date: new Date(p.createdAt),
        ref: p.voucherNo,
        refId: p.id,
        type: 'RECEIPT',
        description: `Receipt voucher ${p.voucherNo}`,
        debit: 0,
        credit: Number(p.amount),
      });
    }

    all.sort((a, b) => a.date.getTime() - b.date.getTime());

    const entries: LedgerEntry[] = [];
    let balance = opening;
    if (opening !== 0) {
      entries.push({
        date: customer.createdAt,
        ref: '—',
        refId: customer.id,
        type: 'OPENING',
        description: 'Opening balance',
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? -opening : 0,
        balance,
      });
    }
    for (const e of all) {
      balance = balance + e.debit - e.credit;
      entries.push({ ...e, balance });
    }

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    return {
      customer,
      openingBalance: opening,
      entries,
      closingBalance: balance,
      totalDebit,
      totalCredit,
    };
  }

  async customerBalance(customerId: string) {
    const ledger = await this.customerLedger(customerId);
    return { customerId, balance: ledger.closingBalance };
  }

  async allCustomerBalances() {
    const list = await this.customers.find({ order: { name: 'ASC' } });
    const results = await Promise.all(
      list.map(async (c) => {
        const l = await this.customerLedger(c.id);
        return { ...c, balance: l.closingBalance };
      }),
    );
    return results;
  }

  // ──────────────────────────────────────────────────────────
  // Supplier ledger + balance (A/P)
  // ──────────────────────────────────────────────────────────

  async supplierLedger(supplierId: string, asOf?: Date) {
    const supplier = await this.suppliers.findOne({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);

    // From our books, supplier is a liability: purchases = credit (we owe more),
    // payments = debit (we owe less). Balance is the amount we still owe.
    const opening = Number(supplier.openingBalance ?? 0);
    const dateClause = asOf ? { createdAt: LessThanOrEqual(asOf) } : {};
    const purchases = await this.purchases.find({
      where: { supplierId, ...dateClause },
    });
    const returns = await this.purchaseReturns.find({
      where: { supplierId, ...dateClause },
    });
    const payments = await this.payments.find({
      where: { supplierId, direction: 'OUT', ...dateClause },
    });

    const all: Array<{
      date: Date;
      ref: string;
      refId: string;
      type: string;
      description: string;
      debit: number;
      credit: number;
    }> = [];

    for (const p of purchases) {
      all.push({
        date: new Date(p.createdAt),
        ref: p.billNo,
        refId: p.id,
        type: 'PURCHASE',
        description: `Purchase bill ${p.billNo} (${p.paymentMethod})`,
        debit: 0,
        credit: Number(p.netAmount),
      });
      const paid = Number(p.paidAmount ?? 0);
      if (paid > 0) {
        all.push({
          date: new Date(p.createdAt),
          ref: p.billNo,
          refId: p.id,
          type: 'PAID_AT_PURCHASE',
          description: `Paid at purchase (${p.paymentMethod})`,
          debit: paid,
          credit: 0,
        });
      }
    }
    for (const r of returns) {
      all.push({
        date: new Date(r.createdAt),
        ref: r.returnNo,
        refId: r.id,
        type: 'PURCHASE_RETURN',
        description: `Purchase return ${r.returnNo}`,
        debit: Number(r.totalAmount),
        credit: 0,
      });
    }
    for (const p of payments) {
      all.push({
        date: new Date(p.createdAt),
        ref: p.voucherNo,
        refId: p.id,
        type: 'PAYMENT',
        description: `Payment voucher ${p.voucherNo}`,
        debit: Number(p.amount),
        credit: 0,
      });
    }

    all.sort((a, b) => a.date.getTime() - b.date.getTime());

    const entries: LedgerEntry[] = [];
    let balance = opening;
    if (opening !== 0) {
      entries.push({
        date: supplier.createdAt,
        ref: '—',
        refId: supplier.id,
        type: 'OPENING',
        description: 'Opening balance',
        debit: opening < 0 ? -opening : 0,
        credit: opening > 0 ? opening : 0,
        balance,
      });
    }
    for (const e of all) {
      balance = balance + e.credit - e.debit;
      entries.push({ ...e, balance });
    }

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    return {
      supplier,
      openingBalance: opening,
      entries,
      closingBalance: balance,
      totalDebit,
      totalCredit,
    };
  }

  async allSupplierBalances() {
    const list = await this.suppliers.find({ order: { name: 'ASC' } });
    const results = await Promise.all(
      list.map(async (s) => {
        const l = await this.supplierLedger(s.id);
        return { ...s, balance: l.closingBalance };
      }),
    );
    return results;
  }

  // ──────────────────────────────────────────────────────────
  // Account ledger (Bank / Wallet / Capital / Credit / Cash)
  // ──────────────────────────────────────────────────────────

  /**
   * Movement history for a single account: payment vouchers, fund transfers
   * in/out, and (for CASH accounts) day-book entries. Running balance walks
   * forward from the account's opening balance.
   */
  async accountLedger(accountId: string, asOf?: Date) {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    const dateClause = asOf ? { createdAt: LessThanOrEqual(asOf) } : {};

    const opening = Number(account.openingBalance ?? 0);

    // 1) Payment vouchers on this account.
    const vouchers = await this.payments.find({
      where: { accountId, ...dateClause },
    });

    // 2) Fund transfers touching this account (either side).
    const transfersOut = await this.transfers.findInvolvingAccounts(
      [accountId],
      new Date(0),
      asOf ?? new Date('9999-12-31'),
    );

    type Row = {
      date: Date;
      ref: string;
      refId: string;
      type: string;
      description: string;
      debit: number;
      credit: number;
    };
    const rows: Row[] = [];

    for (const v of vouchers) {
      // From the account's POV: IN voucher = money received → debit (we have more)
      // OUT voucher = money paid → credit (we have less).
      const debit = v.direction === 'IN' ? Number(v.amount) : 0;
      const credit = v.direction === 'OUT' ? Number(v.amount) : 0;
      const partyName =
        v.direction === 'IN' ? v.customer?.name : v.supplier?.name;
      rows.push({
        date: new Date(v.createdAt),
        ref: v.voucherNo,
        refId: v.id,
        type: v.direction === 'IN' ? 'RECEIPT' : 'PAYMENT',
        description: partyName
          ? `${v.direction === 'IN' ? 'Receipt from' : 'Payment to'} ${partyName}`
          : v.notes ?? v.voucherNo,
        debit,
        credit,
      });
    }

    for (const t of transfersOut) {
      const isIn = t.toAccountId === accountId;
      rows.push({
        date: new Date(t.createdAt),
        ref: t.transferNo,
        refId: t.id,
        type: isIn ? 'TRANSFER_IN' : 'TRANSFER_OUT',
        description: isIn
          ? `Transfer from ${t.fromAccount?.name ?? '—'}`
          : `Transfer to ${t.toAccount?.name ?? '—'}`,
        debit: isIn ? Number(t.amount) : 0,
        credit: isIn ? 0 : Number(t.amount),
      });
    }

    // 3) Sale / Purchase paid-at-time portions that hit this specific account.
    //    Sales/purchases don't store accountId — payment-method-CASH only counts
    //    for CASH accounts. Plus the existing voucher rows above already cover
    //    the explicit cases. We surface CASH paid-at-time too for CASH accounts.
    if (account.type === 'CASH') {
      const sales = await this.sales.find({
        where: { paymentMethod: 'CASH' as any, ...dateClause },
      });
      for (const s of sales) {
        const paid = Number(s.paidAmount ?? 0);
        if (paid <= 0) continue;
        rows.push({
          date: new Date(s.createdAt),
          ref: s.invoiceNo,
          refId: s.id,
          type: 'CASH_SALE',
          description: `Cash sale ${s.invoiceNo}`,
          debit: paid,
          credit: 0,
        });
      }
      const purchases = await this.purchases.find({
        where: { paymentMethod: 'CASH', ...dateClause },
      });
      for (const p of purchases) {
        const paid = Number(p.paidAmount ?? 0);
        if (paid <= 0) continue;
        rows.push({
          date: new Date(p.createdAt),
          ref: p.billNo,
          refId: p.id,
          type: 'CASH_PURCHASE',
          description: `Cash purchase ${p.billNo}`,
          debit: 0,
          credit: paid,
        });
      }
    }

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());

    const entries: Array<Row & { balance: number }> = [];
    let balance = opening;
    if (opening !== 0) {
      entries.push({
        date: account.createdAt,
        ref: '—',
        refId: account.id,
        type: 'OPENING',
        description: 'Opening balance',
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? -opening : 0,
        balance,
      });
    }
    for (const r of rows) {
      balance = balance + r.debit - r.credit;
      entries.push({ ...r, balance });
    }

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    return {
      account,
      openingBalance: opening,
      entries,
      closingBalance: balance,
      totalDebit,
      totalCredit,
    };
  }

  /** All accounts with their current closing balance — for the sidebar/index. */
  async allAccountBalances() {
    const list = await this.accounts.find({ order: { name: 'ASC' } });
    const results = await Promise.all(
      list.map(async (a) => {
        const l = await this.accountLedger(a.id);
        return { ...a, balance: l.closingBalance };
      }),
    );
    return results;
  }

  // ──────────────────────────────────────────────────────────
  // Stock ledger
  // ──────────────────────────────────────────────────────────

  async stockLedger(filter: {
    itemId?: string;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
    from?: string;
    to?: string;
  }) {
    // Resolve item ids matching the filters.
    let itemIds: string[] | undefined;

    if (filter.itemId) {
      itemIds = [filter.itemId];
    } else if (filter.categoryId) {
      const rows = await this.items
        .createQueryBuilder('i')
        .innerJoin('item_categories', 'ic', 'ic.item_id = i.id')
        .where('ic.category_id = :cid', { cid: filter.categoryId })
        .select('i.id', 'id')
        .getRawMany();
      itemIds = rows.map((r) => r.id);
    } else if (filter.brandId) {
      const rows = await this.items.find({ where: { brandId: filter.brandId } });
      itemIds = rows.map((r) => r.id);
    } else if (filter.supplierId) {
      // Items that appear on at least one purchase from this supplier.
      const rows = await this.purchaseItems
        .createQueryBuilder('pi')
        .innerJoin('pi.purchase', 'p')
        .where('p.supplier_id = :sid', { sid: filter.supplierId })
        .select('DISTINCT pi.item_id', 'id')
        .getRawMany();
      itemIds = rows.map((r) => r.id);
    }

    if (itemIds && itemIds.length === 0) {
      return {
        filter,
        movements: [],
        totalIn: 0,
        totalOut: 0,
        netChange: 0,
      };
    }

    const qb = this.movements
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.item', 'item')
      .leftJoinAndSelect('m.store', 'store')
      .orderBy('m.createdAt', 'ASC');
    if (itemIds) qb.andWhere('m.item_id IN (:...ids)', { ids: itemIds });
    if (filter.from) qb.andWhere('m.createdAt >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('m.createdAt <= :to', { to: filter.to });

    const movements = await qb.getMany();

    let totalIn = 0;
    let totalOut = 0;
    let runningBalance = 0;
    const rows = movements.map((m) => {
      const qty = Number(m.quantity);
      if (m.type === 'IN') {
        totalIn += qty;
        runningBalance += qty;
      } else {
        totalOut += qty;
        runningBalance -= qty;
      }
      return {
        id: m.id,
        date: m.createdAt,
        itemId: m.itemId,
        itemName: m.item?.name,
        sku: m.item?.sku,
        storeName: m.store?.name ?? null,
        type: m.type,
        quantity: qty,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        runningBalance,
      };
    });

    return {
      filter,
      movements: rows,
      totalIn,
      totalOut,
      netChange: totalIn - totalOut,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Income Statement (P&L)
  // ──────────────────────────────────────────────────────────

  async incomeStatement(from?: string, to?: string) {
    const where = this.buildDateWhere(from, to);
    const sales = await this.sales.find({ where });
    const returns = await this.saleReturns.find({ where });

    const grossRevenue = sales.reduce((s, x) => s + Number(x.totalAmount), 0);
    const discounts = sales.reduce((s, x) => s + Number(x.discount), 0);
    const netRevenue = sales.reduce((s, x) => s + Number(x.netAmount), 0);
    const returnsValue = returns.reduce((s, x) => s + Number(x.totalAmount), 0);

    // COGS via item purchase price at time of sale (approximation — no batch costing).
    let cogs = 0;
    for (const s of sales) {
      for (const ln of s.lines ?? []) {
        const it = ln.item;
        if (!it) continue;
        cogs += Number(it.purchasePrice) * Number(ln.quantity);
      }
    }
    // Returns reduce COGS proportionally.
    let returnsCogs = 0;
    for (const r of returns) {
      for (const ln of r.lines ?? []) {
        const it = ln.item;
        if (!it) continue;
        returnsCogs += Number(it.purchasePrice) * Number(ln.quantity);
      }
    }

    const grossProfit = netRevenue - returnsValue - (cogs - returnsCogs);
    const expenses = 0; // no expense module yet

    // Incentives are a separate margin bucket: we sometimes book per-unit
    // losses to clear a target that unlocks a larger incentive, so net income
    // must include both gross margin AND incentive awards in the period.
    const incentivesEarned = await this.incentives.awardsTotal(from, to);

    const netIncome = grossProfit - expenses;
    const adjustedNetIncome = netIncome + incentivesEarned;

    return {
      period: { from: from ?? null, to: to ?? null },
      revenue: {
        grossRevenue,
        discounts,
        netRevenue,
        returns: returnsValue,
        revenueAfterReturns: netRevenue - returnsValue,
      },
      cogs: {
        cogs,
        returnsCogs,
        netCogs: cogs - returnsCogs,
      },
      grossProfit,
      expenses,
      netIncome,
      incentives: incentivesEarned,
      adjustedNetIncome,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Balance Sheet
  // ──────────────────────────────────────────────────────────

  async balanceSheet(asOf?: string) {
    const asOfDate = asOf ? new Date(asOf) : new Date();

    // Cash on hand by account type
    const accounts = await this.accounts.find();
    const cashAccountIds = accounts.filter((a) => a.type === 'CASH').map((a) => a.id);
    const bankAccountIds = accounts.filter((a) => a.type === 'BANK').map((a) => a.id);
    const walletAccountIds = accounts.filter((a) => a.type === 'WALLET').map((a) => a.id);
    const capitalAccountIds = accounts.filter((a) => a.type === 'CAPITAL').map((a) => a.id);
    const creditAccountIds = accounts.filter((a) => a.type === 'CREDIT').map((a) => a.id);

    const accountBalance = async (ids: string[]) => {
      const opening = accounts
        .filter((a) => ids.includes(a.id))
        .reduce((s, a) => s + Number(a.openingBalance ?? 0), 0);
      if (ids.length === 0) return opening;
      const inSum = await this.payments
        .createQueryBuilder('p')
        .where('p.direction = :d', { d: 'IN' })
        .andWhere('p.account_id IN (:...ids)', { ids })
        .andWhere('p.created_at <= :asOf', { asOf: asOfDate })
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .getRawOne();
      const outSum = await this.payments
        .createQueryBuilder('p')
        .where('p.direction = :d', { d: 'OUT' })
        .andWhere('p.account_id IN (:...ids)', { ids })
        .andWhere('p.created_at <= :asOf', { asOf: asOfDate })
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .getRawOne();
      const transferDelta = await this.transfers.groupDeltaAt(ids, asOfDate);
      return (
        opening +
        Number(inSum?.sum ?? 0) -
        Number(outSum?.sum ?? 0) +
        transferDelta
      );
    };

    const cash = await accountBalance(cashAccountIds);
    const bank = await accountBalance(bankAccountIds);
    const wallet = await accountBalance(walletAccountIds);
    const capital = await accountBalance(capitalAccountIds);
    const credit = await accountBalance(creditAccountIds);

    // Inventory at cost = sum on-hand * purchasePrice
    const items = await this.items.find();
    let inventory = 0;
    for (const it of items) {
      const row = await this.movements
        .createQueryBuilder('m')
        .where('m.item_id = :id', { id: it.id })
        .andWhere('m.created_at <= :asOf', { asOf: asOfDate })
        .select(
          "COALESCE(SUM(CASE WHEN m.type = 'IN' THEN m.quantity ELSE -m.quantity END), 0)",
          'qty',
        )
        .getRawOne();
      const qty = Number(row?.qty ?? 0);
      inventory += qty * Number(it.purchasePrice);
    }

    // A/R = sum of all customer balances
    const customers = await this.customers.find();
    let accountsReceivable = 0;
    for (const c of customers) {
      const l = await this.customerLedger(c.id, asOfDate);
      accountsReceivable += Number(l.closingBalance);
    }

    // A/P = sum of all supplier balances
    const suppliers = await this.suppliers.find();
    let accountsPayable = 0;
    for (const s of suppliers) {
      const l = await this.supplierLedger(s.id, asOfDate);
      accountsPayable += Number(l.closingBalance);
    }

    // Treasury assets (excluding capital — capital sits as Owner's contribution
    // in equity, and its balance flows out via transfers into Cash/Bank/etc.).
    // CREDIT is a liability: balance represents outstanding credit-card / loan
    // amount, so we show it on the liability side as `creditPayable`.
    const totalAssets = cash + bank + wallet + inventory + accountsReceivable;
    const creditPayable = -credit; // CREDIT balance is negative when money owed
    const totalLiabilities = accountsPayable + Math.max(0, creditPayable);
    // Equity bucket = computed equity (assets − liabilities) which already
    // reflects owner contributions; capital_contributed is reported alongside
    // for transparency.
    const equity = totalAssets - totalLiabilities;

    return {
      asOf: asOfDate,
      assets: {
        cash,
        bank,
        wallet,
        inventory,
        accountsReceivable,
        total: totalAssets,
      },
      liabilities: {
        accountsPayable,
        creditPayable: Math.max(0, creditPayable),
        total: totalLiabilities,
      },
      equity: {
        capitalContributed: capital,
        retainedEarnings: equity - capital,
        total: equity,
      },
    };
  }

  // ──────────────────────────────────────────────────────────
  // Cash flow (simple direct method)
  // ──────────────────────────────────────────────────────────

  async cashFlow(from?: string, to?: string) {
    const where = this.buildDateWhere(from, to);

    const receipts = await this.payments.find({
      where: { ...where, direction: 'IN' },
    });
    const payouts = await this.payments.find({
      where: { ...where, direction: 'OUT' },
    });

    // Also include cash that flowed through sales/purchases without an explicit voucher.
    // For simplicity we only count explicit payment vouchers + the paid-at-time portion.
    const sales = await this.sales.find({ where });
    const purchases = await this.purchases.find({ where });

    const receiptsTotal = receipts.reduce((s, p) => s + Number(p.amount), 0);
    const paymentsTotal = payouts.reduce((s, p) => s + Number(p.amount), 0);
    const cashFromSales = sales.reduce((s, x) => s + Number(x.paidAmount ?? 0), 0);
    const cashToPurchases = purchases.reduce(
      (s, x) => s + Number(x.paidAmount ?? 0),
      0,
    );

    const operatingInflows = receiptsTotal + cashFromSales;
    const operatingOutflows = paymentsTotal + cashToPurchases;
    const netOperating = operatingInflows - operatingOutflows;

    // Compute beginning and ending cash position from balance sheet.
    const beginningBS = from ? await this.cashAndBankAt(new Date(from)) : 0;
    const endingBS = to ? await this.cashAndBankAt(new Date(to)) : await this.cashAndBankAt(new Date());

    return {
      period: { from: from ?? null, to: to ?? null },
      beginningCash: beginningBS,
      operating: {
        receipts: receiptsTotal,
        cashSales: cashFromSales,
        inflows: operatingInflows,
        payments: paymentsTotal,
        cashPurchases: cashToPurchases,
        outflows: operatingOutflows,
        net: netOperating,
      },
      investing: { net: 0 },
      financing: { net: 0 },
      netChange: netOperating,
      endingCash: endingBS,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Statement of changes in equity
  // ──────────────────────────────────────────────────────────

  async equityChanges(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date('1970-01-01');
    const end = to ? new Date(to) : new Date();

    const openingBS = await this.balanceSheet(start.toISOString());
    const closingBS = await this.balanceSheet(end.toISOString());
    const period = await this.incomeStatement(from, to);

    const periodIncome = period.adjustedNetIncome ?? period.netIncome;

    const openingEquity = openingBS.equity.total;
    const closingEquity = closingBS.equity.total;

    return {
      period: { from: from ?? null, to: to ?? null },
      openingEquity,
      netIncome: period.netIncome,
      incentives: period.incentives ?? 0,
      adjustedNetIncome: periodIncome,
      capitalContributedDelta:
        closingBS.equity.capitalContributed -
        openingBS.equity.capitalContributed,
      drawings: 0,
      closingEquity,
      balanceCheck: {
        expected: openingEquity + periodIncome,
        actual: closingEquity,
        difference: closingEquity - (openingEquity + periodIncome),
      },
    };
  }

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────

  private buildDateWhere(from?: string, to?: string) {
    if (from && to) return { createdAt: Between(new Date(from), new Date(to)) };
    if (to) return { createdAt: LessThanOrEqual(new Date(to)) };
    return {};
  }

  private async cashAndBankAt(asOf: Date) {
    const accounts = await this.accounts.find({
      where: [{ type: 'CASH' as any }, { type: 'BANK' as any }, { type: 'WALLET' as any }],
    });
    if (accounts.length === 0) return 0;
    const ids = accounts.map((a) => a.id);
    const opening = accounts.reduce((s, a) => s + Number(a.openingBalance ?? 0), 0);
    const inSum = await this.payments
      .createQueryBuilder('p')
      .where('p.direction = :d', { d: 'IN' })
      .andWhere('p.account_id IN (:...ids)', { ids })
      .andWhere('p.created_at <= :asOf', { asOf })
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .getRawOne();
    const outSum = await this.payments
      .createQueryBuilder('p')
      .where('p.direction = :d', { d: 'OUT' })
      .andWhere('p.account_id IN (:...ids)', { ids })
      .andWhere('p.created_at <= :asOf', { asOf })
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .getRawOne();
    const transferDelta = await this.transfers.groupDeltaAt(ids, asOf);
    return (
      opening + Number(inSum?.sum ?? 0) - Number(outSum?.sum ?? 0) + transferDelta
    );
  }
}
