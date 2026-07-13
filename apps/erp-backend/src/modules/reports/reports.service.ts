import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
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
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { IncentivesService } from '../incentives/incentives.service';
import { FundTransfersService } from '../fund-transfers/fund-transfers.service';
import { EmployeeIncentivesService } from '../employee-incentives/employee-incentives.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeTransaction } from '../employee-transactions/entities/employee-transaction.entity';
import { JournalLine } from '../journals/entities/journal-line.entity';

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
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(StockMovement) private readonly movements: Repository<StockMovement>,
    private readonly incentives: IncentivesService,
    private readonly transfers: FundTransfersService,
    private readonly employeeIncentives: EmployeeIncentivesService,
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(EmployeeTransaction)
    private readonly employeeTxns: Repository<EmployeeTransaction>,
    @InjectRepository(JournalLine)
    private readonly journalLines: Repository<JournalLine>,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Employee ledger
  // ──────────────────────────────────────────────────────────

  /**
   * Per-employee ledger. Credits (we paid them / settled what we owed) are
   * salary, advances, expense reimbursements, and incentive payouts.
   * Debits (we owe them more) are incentives EARNED (computed from
   * incentive rules × sales in the period). Running balance positive means
   * we still owe the employee; negative means they owe us (took advance
   * not yet settled).
   */
  async employeeLedger(employeeId: string, from?: string, to?: string) {
    const employee = await this.employees.findOne({ where: { id: employeeId } });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }
    const periodFrom = from ?? '1970-01-01';
    const periodTo = to ?? new Date().toISOString().slice(0, 10);

    const txnWhere: any = { employeeId };
    if (from && to) txnWhere.transactionDate = Between(from, to);
    // Earned incentives in period — debit (employee earns, we owe)
    const [incentiveCalc, txns] = await Promise.all([
      this.employeeIncentives.computeForPeriod(periodFrom, periodTo, employeeId),
      this.employeeTxns.find({ where: txnWhere }),
    ]);

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

    // Opening row if non-zero
    const opening = Number(employee.openingBalance ?? 0);

    for (const r of incentiveCalc.rows) {
      rows.push({
        date: new Date(r.saleDate),
        ref: r.invoiceNo,
        refId: r.saleId,
        type: 'INCENTIVE',
        description: `${r.itemName ?? 'Item'} · ${r.percentage}% · base ${r.baseAmount.toFixed(2)}`,
        debit: r.amount > 0 ? r.amount : 0,
        credit: r.amount < 0 ? -r.amount : 0,
      });
    }
    for (const t of txns) {
      // Debits INCREASE what we owe the employee:
      //   SALARY_ACCRUED — the monthly salary obligation booked by the scheduler;
      //   EXPENSE        — a shop cost the employee paid out of their OWN pocket,
      //                    so the shop now owes them back.
      // Credits (SALARY / ADVANCE / REIMBURSEMENT / INCENTIVE_PAYOUT) are money
      // moving out of the shop to the employee, settling what we owed. A cash
      // reimbursement of an EXPENSE is a separate REIMBURSEMENT row, so the
      // expense (debit) and the payout (credit) net to zero. ADJUSTMENT stays a
      // credit.
      const amount = Number(t.amount);
      const isDebit = t.type === 'SALARY_ACCRUED' || t.type === 'EXPENSE';
      rows.push({
        date: new Date(`${t.transactionDate}T00:00:00.000Z`),
        ref: t.voucherNo,
        refId: t.id,
        type: t.type,
        description: t.description ?? labelForType(t.type),
        debit: isDebit ? amount : 0,
        credit: isDebit ? 0 : amount,
      });
    }

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());

    const entries: Array<Row & { balance: number }> = [];
    let balance = opening;
    if (opening !== 0) {
      entries.push({
        date: employee.createdAt,
        ref: '—',
        refId: employee.id,
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
      employee,
      openingBalance: opening,
      entries,
      closingBalance: balance,
      totalDebit,
      totalCredit,
      incentivesEarned: incentiveCalc.total,
      period: { from: periodFrom, to: periodTo },
    };
  }

  /**
   * All employees with their current ledger closing balance.
   *
   * Batched: one pass to compute incentive totals for everyone, one query to
   * sum employee_transactions per employee. Avoids the N+1 trip into
   * `employeeLedger` (which would otherwise re-run the incentive engine for
   * every employee).
   */
  async allEmployeeBalances() {
    const list = await this.employees.find({ order: { name: 'ASC' } });
    if (list.length === 0) return [];

    const periodFrom = '1970-01-01';
    const periodTo = new Date().toISOString().slice(0, 10);

    const incentiveCalc = await this.employeeIncentives.computeForPeriod(
      periodFrom,
      periodTo,
    );
    // Sum per (employee, type) so we can split debits (SALARY_ACCRUED)
    // from credits (everything else). Treat each in the same direction
    // the ledger does so the running balance and the rollup agree.
    const txnSums = await this.employeeTxns
      .createQueryBuilder('t')
      .select('t.employee_id', 'employeeId')
      .addSelect('t.type', 'type')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'sum')
      .groupBy('t.employee_id')
      .addGroupBy('t.type')
      .getRawMany();
    const debits = new Map<string, number>();
    const credits = new Map<string, number>();
    for (const r of txnSums) {
      // Keep in lockstep with employeeLedger's isDebit: SALARY_ACCRUED and
      // EXPENSE increase what we owe (debit); everything else is a credit.
      const map =
        r.type === 'SALARY_ACCRUED' || r.type === 'EXPENSE' ? debits : credits;
      map.set(r.employeeId, (map.get(r.employeeId) ?? 0) + Number(r.sum));
    }

    return list.map((e) => {
      const opening = Number(e.openingBalance ?? 0);
      const incentives = Number(incentiveCalc.byEmployee[e.id] ?? 0);
      const debit = debits.get(e.id) ?? 0;
      const credit = credits.get(e.id) ?? 0;
      return { ...e, balance: opening + incentives + debit - credit };
    });
  }

  // ──────────────────────────────────────────────────────────
  // Customer ledger + balance (A/R)
  // ──────────────────────────────────────────────────────────

  async customerLedger(customerId: string, asOf?: Date) {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    const opening = Number(customer.openingBalance ?? 0);
    const dateClause = asOf ? { createdAt: LessThanOrEqual(asOf) } : {};
    const [sales, returns, receipts] = await Promise.all([
      this.sales.find({ where: { customerId, ...dateClause } }),
      this.saleReturns.find({ where: { customerId, ...dateClause } }),
      this.payments.find({
        where: { customerId, direction: 'IN', ...dateClause },
      }),
    ]);

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

  /**
   * All customers with their A/R balance.
   *
   * Batched: instead of running `customerLedger` per customer (4 queries each
   * → 4N+1), we run four GROUP-BY-customer aggregates and combine in JS.
   * Mirrors the same +debit / -credit math as `customerLedger`:
   *   balance = opening + sales.net − sales.paid − returns.total − receipts.amount
   *
   * `asOf` (optional) restricts every aggregate to rows created on or before
   * the cutoff — used by `balanceSheet` for the "as of date X" view without
   * fanning out a per-customer ledger query.
   */
  async allCustomerBalances(asOf?: Date) {
    const list = await this.customers.find({ order: { name: 'ASC' } });
    if (list.length === 0) return [];

    const applyAsOf = <T extends { andWhere(...args: any[]): T }>(
      qb: T,
      column: string,
    ): T => (asOf ? qb.andWhere(`${column} <= :asOf`, { asOf }) : qb);

    const [saleSums, returnSums, receiptSums] = await Promise.all([
      applyAsOf(
        this.sales
          .createQueryBuilder('s')
          .select('s.customer_id', 'cid')
          .addSelect('COALESCE(SUM(s.net_amount), 0)', 'net')
          .addSelect('COALESCE(SUM(s.paid_amount), 0)', 'paid')
          .where('s.customer_id IS NOT NULL'),
        's.created_at',
      )
        .groupBy('s.customer_id')
        .getRawMany(),
      applyAsOf(
        this.saleReturns
          .createQueryBuilder('r')
          .select('r.customer_id', 'cid')
          .addSelect('COALESCE(SUM(r.total_amount), 0)', 'total')
          .where('r.customer_id IS NOT NULL'),
        'r.created_at',
      )
        .groupBy('r.customer_id')
        .getRawMany(),
      applyAsOf(
        this.payments
          .createQueryBuilder('p')
          .select('p.customer_id', 'cid')
          .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.direction = :d', { d: 'IN' })
          .andWhere('p.customer_id IS NOT NULL'),
        'p.created_at',
      )
        .groupBy('p.customer_id')
        .getRawMany(),
    ]);

    const saleMap = new Map<string, { net: number; paid: number }>(
      saleSums.map((r) => [r.cid, { net: Number(r.net), paid: Number(r.paid) }]),
    );
    const returnMap = new Map<string, number>(
      returnSums.map((r) => [r.cid, Number(r.total)]),
    );
    const receiptMap = new Map<string, number>(
      receiptSums.map((r) => [r.cid, Number(r.total)]),
    );

    return list.map((c) => {
      const opening = Number(c.openingBalance ?? 0);
      const s = saleMap.get(c.id) ?? { net: 0, paid: 0 };
      const ret = returnMap.get(c.id) ?? 0;
      const rcpt = receiptMap.get(c.id) ?? 0;
      return { ...c, balance: opening + s.net - s.paid - ret - rcpt };
    });
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
    const [purchases, returns, payments] = await Promise.all([
      this.purchases.find({ where: { supplierId, ...dateClause } }),
      this.purchaseReturns.find({ where: { supplierId, ...dateClause } }),
      this.payments.find({
        where: { supplierId, direction: 'OUT', ...dateClause },
      }),
    ]);

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

  /**
   * All suppliers with their A/P balance.
   *
   * Batched: same approach as `allCustomerBalances`. Mirrors `supplierLedger`'s
   * +credit / -debit math:
   *   balance = opening + purchases.net − purchases.paid − returns.total − payments.amount
   *
   * `asOf` (optional) restricts every aggregate to rows created on or before
   * the cutoff — used by `balanceSheet` for the "as of date X" view without
   * fanning out a per-supplier ledger query.
   */
  async allSupplierBalances(asOf?: Date) {
    const list = await this.suppliers.find({ order: { name: 'ASC' } });
    if (list.length === 0) return [];

    const applyAsOf = <T extends { andWhere(...args: any[]): T }>(
      qb: T,
      column: string,
    ): T => (asOf ? qb.andWhere(`${column} <= :asOf`, { asOf }) : qb);

    const [purchaseSums, returnSums, paymentSums] = await Promise.all([
      applyAsOf(
        this.purchases
          .createQueryBuilder('p')
          .select('p.supplier_id', 'sid')
          .addSelect('COALESCE(SUM(p.net_amount), 0)', 'net')
          .addSelect('COALESCE(SUM(p.paid_amount), 0)', 'paid')
          .where('p.supplier_id IS NOT NULL'),
        'p.created_at',
      )
        .groupBy('p.supplier_id')
        .getRawMany(),
      applyAsOf(
        this.purchaseReturns
          .createQueryBuilder('r')
          .select('r.supplier_id', 'sid')
          .addSelect('COALESCE(SUM(r.total_amount), 0)', 'total')
          .where('r.supplier_id IS NOT NULL'),
        'r.created_at',
      )
        .groupBy('r.supplier_id')
        .getRawMany(),
      applyAsOf(
        this.payments
          .createQueryBuilder('p')
          .select('p.supplier_id', 'sid')
          .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.direction = :d', { d: 'OUT' })
          .andWhere('p.supplier_id IS NOT NULL'),
        'p.created_at',
      )
        .groupBy('p.supplier_id')
        .getRawMany(),
    ]);

    const purMap = new Map<string, { net: number; paid: number }>(
      purchaseSums.map((r) => [r.sid, { net: Number(r.net), paid: Number(r.paid) }]),
    );
    const retMap = new Map<string, number>(
      returnSums.map((r) => [r.sid, Number(r.total)]),
    );
    const payMap = new Map<string, number>(
      paymentSums.map((r) => [r.sid, Number(r.total)]),
    );

    return list.map((s) => {
      const opening = Number(s.openingBalance ?? 0);
      const p = purMap.get(s.id) ?? { net: 0, paid: 0 };
      const ret = retMap.get(s.id) ?? 0;
      const pay = payMap.get(s.id) ?? 0;
      return { ...s, balance: opening + p.net - p.paid - ret - pay };
    });
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
    // 2) Fund transfers touching this account (either side).
    const [vouchers, transfersOut] = await Promise.all([
      this.payments.find({ where: { accountId, ...dateClause } }),
      this.transfers.findInvolvingAccounts(
        [accountId],
        new Date(0),
        asOf ?? new Date('9999-12-31'),
      ),
    ]);

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

    // 3) Sale paid-at-time portions explicitly attributed to this account
    //    via accountId (POS now lets the cashier pick which bank/wallet/cash
    //    drawer received the money). These apply to ANY account type.
    const attributedSales = await this.sales.find({
      where: { accountId, ...dateClause },
    });
    for (const s of attributedSales) {
      const paid = Number(s.paidAmount ?? 0);
      if (paid <= 0) continue;
      rows.push({
        date: new Date(s.createdAt),
        ref: s.invoiceNo,
        refId: s.id,
        type: 'SALE_RECEIPT',
        description: `Sale ${s.invoiceNo} (${s.paymentMethod})`,
        debit: paid,
        credit: 0,
      });
    }

    // 4) Legacy CASH fallback: cash sales / purchases without an explicit
    //    account_id are spread to every CASH account. New POS sales pick an
    //    account so they're excluded here to avoid double-counting.
    if (account.type === 'CASH') {
      const [cashSales, cashPurchases] = await Promise.all([
        this.sales.find({
          where: {
            paymentMethod: 'CASH' as any,
            accountId: IsNull(),
            ...dateClause,
          },
        }),
        this.purchases.find({
          where: { paymentMethod: 'CASH', ...dateClause },
        }),
      ]);
      for (const s of cashSales) {
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
      for (const p of cashPurchases) {
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

  /**
   * All accounts with their current closing balance — for the sidebar/index.
   *
   * Batched: one aggregate per source (payments, transfers in, transfers out,
   * cash sales, cash purchases) instead of running the full `accountLedger`
   * per account. Mirrors the same +debit / -credit math:
   *   balance = opening + (payments IN − payments OUT)
   *           + (transfers in − transfers out)
   *           + (CASH only) (cashSales − cashPurchases)
   */
  async allAccountBalances() {
    const list = await this.accounts.find({ order: { name: 'ASC' } });
    if (list.length === 0) return [];

    const [paySums, transferDelta, saleSums] = await Promise.all([
      this.payments
        .createQueryBuilder('p')
        .select('p.account_id', 'aid')
        .addSelect('p.direction', 'dir')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'sum')
        .where('p.account_id IS NOT NULL')
        .groupBy('p.account_id')
        .addGroupBy('p.direction')
        .getRawMany(),
      this.transfers.deltaByAccount(),
      // Sales credited to a specific account via POS checkout.
      this.sales
        .createQueryBuilder('s')
        .select('s.account_id', 'aid')
        .addSelect('COALESCE(SUM(s.paid_amount), 0)', 'sum')
        .where('s.account_id IS NOT NULL')
        .groupBy('s.account_id')
        .getRawMany(),
    ]);

    const payIn = new Map<string, number>();
    const payOut = new Map<string, number>();
    for (const r of paySums) {
      const m = r.dir === 'IN' ? payIn : payOut;
      m.set(r.aid, Number(r.sum));
    }
    const saleByAccount = new Map<string, number>(
      saleSums.map((r) => [r.aid, Number(r.sum)]),
    );

    // Legacy CASH fallback: cash sales / purchases without an explicit
    // account_id are spread to every CASH account. New POS sales pick an
    // account and are excluded from this bucket.
    const hasCash = list.some((a) => a.type === 'CASH');
    let cashSalesTotal = 0;
    let cashPurchasesTotal = 0;
    if (hasCash) {
      const [salesRow, purchasesRow] = await Promise.all([
        this.sales
          .createQueryBuilder('s')
          .select('COALESCE(SUM(s.paid_amount), 0)', 'sum')
          .where("s.payment_method = 'CASH'")
          .andWhere('s.account_id IS NULL')
          .getRawOne(),
        this.purchases
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.paid_amount), 0)', 'sum')
          .where("p.payment_method = 'CASH'")
          .getRawOne(),
      ]);
      cashSalesTotal = Number(salesRow?.sum ?? 0);
      cashPurchasesTotal = Number(purchasesRow?.sum ?? 0);
    }

    return list.map((a) => {
      const opening = Number(a.openingBalance ?? 0);
      const pin = payIn.get(a.id) ?? 0;
      const pout = payOut.get(a.id) ?? 0;
      const td = transferDelta.get(a.id) ?? 0;
      const attributedSales = saleByAccount.get(a.id) ?? 0;
      const cashDelta = a.type === 'CASH' ? cashSalesTotal - cashPurchasesTotal : 0;
      return {
        ...a,
        balance: opening + pin - pout + td + attributedSales + cashDelta,
      };
    });
  }

  // ──────────────────────────────────────────────────────────
  // Stock ledger
  // ──────────────────────────────────────────────────────────

  /**
   * Resolve a product scope filter (one of item / category / brand / supplier)
   * to the concrete set of item ids it covers. Precedence follows the order of
   * the checks below — the first non-empty filter wins. Returns `undefined`
   * when no scope filter is supplied (meaning "all items", so callers must NOT
   * add an `item_id IN (…)` clause). Returns an empty array when a scope was
   * requested but matched no items — callers should short-circuit to an empty
   * result rather than treating it as "all items".
   */
  private async resolveItemIds(filter: {
    itemId?: string;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
  }): Promise<string[] | undefined> {
    if (filter.itemId) return [filter.itemId];
    if (filter.categoryId) {
      const rows = await this.items
        .createQueryBuilder('i')
        .innerJoin('item_categories', 'ic', 'ic.item_id = i.id')
        .where('ic.category_id = :cid', { cid: filter.categoryId })
        .select('i.id', 'id')
        .getRawMany();
      return rows.map((r) => r.id);
    }
    if (filter.brandId) {
      const rows = await this.items.find({ where: { brandId: filter.brandId } });
      return rows.map((r) => r.id);
    }
    if (filter.supplierId) {
      // Items that appear on at least one purchase from this supplier.
      const rows = await this.purchaseItems
        .createQueryBuilder('pi')
        .innerJoin('pi.purchase', 'p')
        .where('p.supplier_id = :sid', { sid: filter.supplierId })
        .select('DISTINCT pi.item_id', 'id')
        .getRawMany();
      return rows.map((r) => r.id);
    }
    return undefined;
  }

  async stockLedger(filter: {
    itemId?: string;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
    from?: string;
    to?: string;
  }) {
    // Resolve item ids matching the filters.
    const itemIds = await this.resolveItemIds(filter);

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
    const [sales, returns] = await Promise.all([
      this.sales.find({ where }),
      this.saleReturns.find({ where }),
    ]);

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

    // Employee incentives are a real labor cost — earned by employees as
    // a percentage of their sales, paid out separately. Subtract from
    // trading net income. Manufacturer/supplier incentives — earned by
    // the shop when targets are hit. Added on top of gross margin to
    // produce adjusted net income.
    const [employeeIncentives, incentivesEarned] = await Promise.all([
      from && to ? this.employeeIncentives.totalForPeriod(from, to) : Promise.resolve(0),
      this.incentives.awardsTotal(from, to),
    ]);
    const expenses = employeeIncentives;

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
      employeeIncentives,
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

    // Run the parallel reads we need to even start (accounts, items, the
    // per-account payment sums, transfer deltas, account-attributed sales).
    // Customer/supplier lists are fetched inside the batched balance helpers
    // below so we don't pull them twice.
    const [accounts, items, paySums, transferDelta, saleAcctSums] =
      await Promise.all([
        this.accounts.find(),
        this.items.find(),
        this.payments
          .createQueryBuilder('p')
          .select('p.account_id', 'aid')
          .addSelect('p.direction', 'dir')
          .addSelect('COALESCE(SUM(p.amount), 0)', 'sum')
          .where('p.account_id IS NOT NULL')
          .andWhere('p.created_at <= :asOf', { asOf: asOfDate })
          .groupBy('p.account_id')
          .addGroupBy('p.direction')
          .getRawMany(),
        this.transfers.deltaByAccount(asOfDate),
        this.sales
          .createQueryBuilder('s')
          .select('s.account_id', 'aid')
          .addSelect('COALESCE(SUM(s.paid_amount), 0)', 'sum')
          .where('s.account_id IS NOT NULL')
          .andWhere('s.created_at <= :asOf', { asOf: asOfDate })
          .groupBy('s.account_id')
          .getRawMany(),
      ]);

    const payIn = new Map<string, number>();
    const payOut = new Map<string, number>();
    for (const r of paySums) {
      const m = r.dir === 'IN' ? payIn : payOut;
      m.set(r.aid, Number(r.sum));
    }
    const saleByAccount = new Map<string, number>(
      saleAcctSums.map((r) => [r.aid, Number(r.sum)]),
    );
    const accountBalance = (ids: string[]) =>
      ids.reduce((s, id) => {
        const acct = accounts.find((a) => a.id === id);
        const op = acct ? Number(acct.openingBalance ?? 0) : 0;
        const td = transferDelta.get(id) ?? 0;
        const pin = payIn.get(id) ?? 0;
        const pout = payOut.get(id) ?? 0;
        const sa = saleByAccount.get(id) ?? 0;
        return s + op + pin - pout + td + sa;
      }, 0);

    const cashAccountIds = accounts.filter((a) => a.type === 'CASH').map((a) => a.id);
    const bankAccountIds = accounts.filter((a) => a.type === 'BANK').map((a) => a.id);
    const walletAccountIds = accounts.filter((a) => a.type === 'WALLET').map((a) => a.id);
    const capitalAccountIds = accounts.filter((a) => a.type === 'CAPITAL').map((a) => a.id);
    const creditAccountIds = accounts.filter((a) => a.type === 'CREDIT').map((a) => a.id);

    const cash = accountBalance(cashAccountIds);
    const bank = accountBalance(bankAccountIds);
    const wallet = accountBalance(walletAccountIds);
    const capital = accountBalance(capitalAccountIds);
    const credit = accountBalance(creditAccountIds);

    // Inventory: one GROUP BY instead of one query per item. Items without
    // any movement default to qty=0 so they're skipped cheaply in JS.
    const movementSums = await this.movements
      .createQueryBuilder('m')
      .select('m.item_id', 'iid')
      .addSelect(
        "COALESCE(SUM(CASE WHEN m.type = 'IN' THEN m.quantity ELSE -m.quantity END), 0)",
        'qty',
      )
      .where('m.created_at <= :asOf', { asOf: asOfDate })
      .groupBy('m.item_id')
      .getRawMany();
    const qtyByItem = new Map<string, number>(
      movementSums.map((r) => [r.iid, Number(r.qty)]),
    );
    let inventory = 0;
    for (const it of items) {
      const qty = qtyByItem.get(it.id) ?? 0;
      inventory += qty * Number(it.purchasePrice);
    }

    // A/R and A/P: one batched GROUP-BY query per side instead of running
    // customerLedger/supplierLedger per entity. With ~200 customers + ~50
    // suppliers this collapses ~900 queries into 6.
    const [arBalances, apBalances] = await Promise.all([
      this.allCustomerBalances(asOfDate),
      this.allSupplierBalances(asOfDate),
    ]);
    const accountsReceivable = arBalances.reduce(
      (s, c) => s + Number(c.balance),
      0,
    );
    const accountsPayable = apBalances.reduce(
      (s, sp) => s + Number(sp.balance),
      0,
    );

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

    // Also include cash that flowed through sales/purchases without an explicit voucher.
    // For simplicity we only count explicit payment vouchers + the paid-at-time portion.
    const [receipts, payouts, sales, purchases, beginningBS, endingBS] =
      await Promise.all([
        this.payments.find({ where: { ...where, direction: 'IN' } }),
        this.payments.find({ where: { ...where, direction: 'OUT' } }),
        this.sales.find({ where }),
        this.purchases.find({ where }),
        from ? this.cashAndBankAt(new Date(from)) : Promise.resolve(0),
        to ? this.cashAndBankAt(new Date(to)) : this.cashAndBankAt(new Date()),
      ]);

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

    const [openingBS, closingBS, period] = await Promise.all([
      this.balanceSheet(start.toISOString()),
      this.balanceSheet(end.toISOString()),
      this.incomeStatement(from, to),
    ]);

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
    const [inSum, outSum, transferDelta, saleSum] = await Promise.all([
      this.payments
        .createQueryBuilder('p')
        .where('p.direction = :d', { d: 'IN' })
        .andWhere('p.account_id IN (:...ids)', { ids })
        .andWhere('p.created_at <= :asOf', { asOf })
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .getRawOne(),
      this.payments
        .createQueryBuilder('p')
        .where('p.direction = :d', { d: 'OUT' })
        .andWhere('p.account_id IN (:...ids)', { ids })
        .andWhere('p.created_at <= :asOf', { asOf })
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .getRawOne(),
      this.transfers.groupDeltaAt(ids, asOf),
      this.sales
        .createQueryBuilder('s')
        .where('s.account_id IN (:...ids)', { ids })
        .andWhere('s.created_at <= :asOf', { asOf })
        .select('COALESCE(SUM(s.paid_amount), 0)', 'sum')
        .getRawOne(),
    ]);
    return (
      opening +
      Number(inSum?.sum ?? 0) -
      Number(outSum?.sum ?? 0) +
      transferDelta +
      Number(saleSum?.sum ?? 0)
    );
  }

  // ──────────────────────────────────────────────────────────
  // A/R + A/P aging
  // ──────────────────────────────────────────────────────────

  /**
   * Customer A/R aging — for each customer with a non-zero outstanding
   * balance as of `asOf`, allocate received cash to their unpaid sales FIFO
   * (oldest first) and bucket the residuals by age.
   *
   * Limitations: this is a snapshot, not a re-statement. Sale returns are
   * NOT netted into the unpaid sales here — they're handled separately in
   * the customer ledger. The opening balance is treated as a "very old"
   * receivable that's first in line to be consumed by receipts.
   */
  async arAging(asOfStr?: string): Promise<{
    asOf: string;
    rows: Array<{
      customerId: string;
      name: string;
      d0_30: number;
      d31_60: number;
      d61_90: number;
      d90: number;
      pastPromise: number;
      total: number;
      maxDaysElapsed: number;
      oldestUnpaidDate: string | null;
      daysSinceFirstPastPromise: number | null;
    }>;
  }> {
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    const customers = await this.customers.find({ order: { name: 'ASC' } });
    const rows: Array<{
      customerId: string;
      name: string;
      d0_30: number;
      d31_60: number;
      d61_90: number;
      d90: number;
      pastPromise: number;
      total: number;
      maxDaysElapsed: number;
      oldestUnpaidDate: string | null;
      daysSinceFirstPastPromise: number | null;
    }> = [];

    for (const c of customers) {
      const sales = await this.sales.find({
        where: {
          customerId: c.id,
          createdAt: LessThanOrEqual(asOf),
        },
        order: { createdAt: 'ASC' },
      });
      const receipts = await this.payments.find({
        where: {
          customerId: c.id,
          direction: 'IN' as any,
          createdAt: LessThanOrEqual(asOf),
        },
      });
      const receiptsTotal = receipts.reduce((s, p) => s + Number(p.amount), 0);
      let remaining = receiptsTotal;
      // `pastPromise` is reported alongside the date-bucketed columns so the
      // UI can highlight customers who missed a specific 15-day promise even
      // when their residual still sits in the 0-30 bucket. It's an overlay,
      // not a separate aging slice — the dN totals + pastPromise overlap.
      const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90: 0, pastPromise: 0 };

      // Days-elapsed tracking (overlays — surfaced alongside buckets):
      //   maxDaysElapsed:        oldest unpaid invoice age across this customer
      //   oldestUnpaidDate:      that invoice's createdAt (ISO) for UI labelling
      //   daysSinceFirstPastPromise:
      //                          how long ago the EARLIEST overdue PENDING
      //                          commitment was promised. Distinct from
      //                          maxDaysElapsed — a customer can have a fresh
      //                          invoice (5 days old) with a 30-day-old broken
      //                          promise inside it.
      let maxDaysElapsed = 0;
      let oldestUnpaidDate: Date | null = null;
      let earliestPastPromise: Date | null = null;

      // Opening balance is oldest by definition — consume receipts here first.
      const opening = Number(c.openingBalance) || 0;
      if (opening > 0) {
        const consume = Math.min(opening, remaining);
        remaining -= consume;
        const leftover = opening - consume;
        if (leftover > 0) buckets.d90 += leftover;
      }

      for (const s of sales) {
        let residual = Number(s.dueAmount);
        if (residual <= 0) continue;
        const consume = Math.min(residual, remaining);
        residual -= consume;
        remaining -= consume;
        if (residual > 0) {
          const ageDays = Math.floor(
            (asOf.getTime() - new Date(s.createdAt).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (ageDays > maxDaysElapsed) {
            maxDaysElapsed = ageDays;
            oldestUnpaidDate = new Date(s.createdAt);
          }
          if (ageDays <= 30) buckets.d0_30 += residual;
          else if (ageDays <= 60) buckets.d31_60 += residual;
          else if (ageDays <= 90) buckets.d61_90 += residual;
          else buckets.d90 += residual;

          // Past-promise overlay: customer committed to a "pay by" date at
          // POS and at least one such commitment is now in the past with a
          // PENDING status. Read from the structured commitments array;
          // the legacy single-date field has been folded into commitments.
          const firstPastPending = (s.paymentCommitments ?? []).find(
            (cm) => cm.status === 'PENDING' && new Date(cm.dueDate) < asOf,
          );
          if (firstPastPending) {
            buckets.pastPromise += residual;
            const d = new Date(firstPastPending.dueDate);
            if (!earliestPastPromise || d < earliestPastPromise) {
              earliestPastPromise = d;
            }
          }
        }
      }

      const total = round2(
        buckets.d0_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90,
      );
      if (total > 0) {
        const daysSinceFirstPastPromise = earliestPastPromise
          ? Math.floor(
              (asOf.getTime() - earliestPastPromise.getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;
        rows.push({
          customerId: c.id,
          name: c.name,
          d0_30: round2(buckets.d0_30),
          d31_60: round2(buckets.d31_60),
          d61_90: round2(buckets.d61_90),
          d90: round2(buckets.d90),
          pastPromise: round2(buckets.pastPromise),
          total,
          maxDaysElapsed,
          oldestUnpaidDate: oldestUnpaidDate
            ? oldestUnpaidDate.toISOString()
            : null,
          daysSinceFirstPastPromise,
        });
      }
    }
    return { asOf: asOf.toISOString(), rows };
  }

  /**
   * Supplier A/P aging — symmetric to A/R but using purchases (we owe them)
   * minus payments OUT.
   */
  async apAging(asOfStr?: string): Promise<{
    asOf: string;
    rows: Array<{
      supplierId: string;
      name: string;
      d0_30: number;
      d31_60: number;
      d61_90: number;
      d90: number;
      total: number;
      maxDaysElapsed: number;
      oldestUnpaidDate: string | null;
    }>;
  }> {
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    const suppliers = await this.suppliers.find({ order: { name: 'ASC' } });
    const rows: Array<{
      supplierId: string;
      name: string;
      d0_30: number;
      d31_60: number;
      d61_90: number;
      d90: number;
      total: number;
      maxDaysElapsed: number;
      oldestUnpaidDate: string | null;
    }> = [];

    for (const sp of suppliers) {
      const purchases = await this.purchases.find({
        where: {
          supplierId: sp.id,
          createdAt: LessThanOrEqual(asOf),
        },
        order: { createdAt: 'ASC' },
      });
      const payments = await this.payments.find({
        where: {
          supplierId: sp.id,
          direction: 'OUT' as any,
          createdAt: LessThanOrEqual(asOf),
        },
      });
      const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
      let remaining = paymentsTotal;
      const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
      let maxDaysElapsed = 0;
      let oldestUnpaidDate: Date | null = null;

      const opening = Number(sp.openingBalance) || 0;
      if (opening > 0) {
        const consume = Math.min(opening, remaining);
        remaining -= consume;
        const leftover = opening - consume;
        if (leftover > 0) buckets.d90 += leftover;
      }

      for (const p of purchases) {
        let residual = Number(p.dueAmount);
        if (residual <= 0) continue;
        const consume = Math.min(residual, remaining);
        residual -= consume;
        remaining -= consume;
        if (residual > 0) {
          const ageDays = Math.floor(
            (asOf.getTime() - new Date(p.createdAt).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (ageDays > maxDaysElapsed) {
            maxDaysElapsed = ageDays;
            oldestUnpaidDate = new Date(p.createdAt);
          }
          if (ageDays <= 30) buckets.d0_30 += residual;
          else if (ageDays <= 60) buckets.d31_60 += residual;
          else if (ageDays <= 90) buckets.d61_90 += residual;
          else buckets.d90 += residual;
        }
      }

      const total = round2(
        buckets.d0_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90,
      );
      if (total > 0) {
        rows.push({
          supplierId: sp.id,
          name: sp.name,
          d0_30: round2(buckets.d0_30),
          d31_60: round2(buckets.d31_60),
          d61_90: round2(buckets.d61_90),
          d90: round2(buckets.d90),
          total,
          maxDaysElapsed,
          oldestUnpaidDate: oldestUnpaidDate
            ? oldestUnpaidDate.toISOString()
            : null,
        });
      }
    }
    return { asOf: asOf.toISOString(), rows };
  }

  /**
   * Per-invoice aging detail for one customer. Same FIFO consumption as
   * arAging() but flattens to a per-sale row so the Customer Ledger page
   * can show "Days Elapsed" per outstanding invoice. Cheap because we
   * already iterated this set inside the bucketing loop.
   */
  async arAgingDetail(
    customerId: string,
    asOfStr?: string,
  ): Promise<{
    asOf: string;
    customer: { id: string; name: string } | null;
    lines: Array<{
      invoiceNo: string;
      saleId: string;
      createdAt: string;
      netAmount: number;
      residualAmount: number;
      daysElapsed: number;
      daysSinceFirstPastPromise: number | null;
      hasPendingCommitment: boolean;
    }>;
  }> {
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    const c = await this.customers.findOne({ where: { id: customerId } });
    if (!c) return { asOf: asOf.toISOString(), customer: null, lines: [] };

    const sales = await this.sales.find({
      where: { customerId, createdAt: LessThanOrEqual(asOf) },
      order: { createdAt: 'ASC' },
    });
    const receipts = await this.payments.find({
      where: {
        customerId,
        direction: 'IN' as any,
        createdAt: LessThanOrEqual(asOf),
      },
    });
    let remaining = receipts.reduce((s, p) => s + Number(p.amount), 0);

    // Opening balance is consumed first as the oldest receivable.
    const opening = Number(c.openingBalance) || 0;
    if (opening > 0) remaining = Math.max(0, remaining - opening);

    const lines: Array<{
      invoiceNo: string;
      saleId: string;
      createdAt: string;
      netAmount: number;
      residualAmount: number;
      daysElapsed: number;
      daysSinceFirstPastPromise: number | null;
      hasPendingCommitment: boolean;
    }> = [];

    for (const s of sales) {
      let residual = Number(s.dueAmount);
      if (residual <= 0) continue;
      const consume = Math.min(residual, remaining);
      residual -= consume;
      remaining -= consume;
      if (residual <= 0) continue;

      const daysElapsed = Math.floor(
        (asOf.getTime() - new Date(s.createdAt).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const pending = (s.paymentCommitments ?? []).filter(
        (cm) => cm.status === 'PENDING',
      );
      const pastPending = pending.filter(
        (cm) => new Date(cm.dueDate) < asOf,
      );
      const daysSinceFirstPastPromise =
        pastPending.length > 0
          ? Math.floor(
              (asOf.getTime() -
                new Date(pastPending[0].dueDate).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

      lines.push({
        invoiceNo: s.invoiceNo,
        saleId: s.id,
        createdAt: new Date(s.createdAt).toISOString(),
        netAmount: round2(Number(s.netAmount)),
        residualAmount: round2(residual),
        daysElapsed,
        daysSinceFirstPastPromise,
        hasPendingCommitment: pending.length > 0,
      });
    }

    return {
      asOf: asOf.toISOString(),
      customer: { id: c.id, name: c.name },
      lines,
    };
  }

  /** Per-bill aging detail for one supplier. Symmetric to arAgingDetail. */
  async apAgingDetail(
    supplierId: string,
    asOfStr?: string,
  ): Promise<{
    asOf: string;
    supplier: { id: string; name: string } | null;
    lines: Array<{
      billNo: string;
      purchaseId: string;
      createdAt: string;
      netAmount: number;
      residualAmount: number;
      daysElapsed: number;
    }>;
  }> {
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    const sp = await this.suppliers.findOne({ where: { id: supplierId } });
    if (!sp) return { asOf: asOf.toISOString(), supplier: null, lines: [] };

    const purchases = await this.purchases.find({
      where: { supplierId, createdAt: LessThanOrEqual(asOf) },
      order: { createdAt: 'ASC' },
    });
    const payments = await this.payments.find({
      where: {
        supplierId,
        direction: 'OUT' as any,
        createdAt: LessThanOrEqual(asOf),
      },
    });
    let remaining = payments.reduce((s, p) => s + Number(p.amount), 0);
    const opening = Number(sp.openingBalance) || 0;
    if (opening > 0) remaining = Math.max(0, remaining - opening);

    const lines: Array<{
      billNo: string;
      purchaseId: string;
      createdAt: string;
      netAmount: number;
      residualAmount: number;
      daysElapsed: number;
    }> = [];

    for (const p of purchases) {
      let residual = Number(p.dueAmount);
      if (residual <= 0) continue;
      const consume = Math.min(residual, remaining);
      residual -= consume;
      remaining -= consume;
      if (residual <= 0) continue;

      const daysElapsed = Math.floor(
        (asOf.getTime() - new Date(p.createdAt).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      lines.push({
        billNo: p.billNo,
        purchaseId: p.id,
        createdAt: new Date(p.createdAt).toISOString(),
        netAmount: round2(Number(p.netAmount)),
        residualAmount: round2(residual),
        daysElapsed,
      });
    }

    return {
      asOf: asOf.toISOString(),
      supplier: { id: sp.id, name: sp.name },
      lines,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Item profitability
  // ──────────────────────────────────────────────────────────

  /**
   * For every item that sold at least once in [from, to], compute:
   *   - qty sold (units)
   *   - revenue (lineTotal sum)
   *   - COGS (current item.purchasePrice × qty — a stand-in for a weighted-
   *     average cost; refined when the journal refactor introduces an
   *     inventory layer with per-batch cost tracking)
   *   - gross profit
   *   - margin % (gross / revenue)
   *
   * Sale returns are subtracted from qty and revenue. Discount-driven
   * negative margins are visible (they don't get clipped).
   */
  async itemMargins(fromStr?: string, toStr?: string): Promise<{
    from: string | null;
    to: string | null;
    rows: Array<{
      itemId: string;
      name: string;
      sku: string;
      qty: number;
      revenue: number;
      cogs: number;
      grossProfit: number;
      marginPct: number;
    }>;
  }> {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    const dateBetween =
      from && to
        ? Between(from, to)
        : from
          ? Between(from, new Date('9999-12-31'))
          : to
            ? Between(new Date(0), to)
            : undefined;

    const sales = await this.sales.find({
      where: dateBetween ? { createdAt: dateBetween } : {},
    });
    const saleIds = sales.map((s) => s.id);
    const saleLines = saleIds.length
      ? await this.saleItems.find({ where: { saleId: In(saleIds) } })
      : [];

    const saleReturns = await this.saleReturns.find({
      where: dateBetween ? { createdAt: dateBetween } : {},
      relations: ['lines'],
    });

    // Aggregate per item
    const agg = new Map<
      string,
      { qty: number; revenue: number }
    >();
    for (const ln of saleLines) {
      const entry = agg.get(ln.itemId) ?? { qty: 0, revenue: 0 };
      entry.qty += Number(ln.quantity);
      entry.revenue += Number(ln.lineTotal);
      agg.set(ln.itemId, entry);
    }
    for (const r of saleReturns) {
      for (const ln of r.lines ?? []) {
        const entry = agg.get(ln.itemId) ?? { qty: 0, revenue: 0 };
        entry.qty -= Number(ln.quantity);
        entry.revenue -= Number(ln.quantity) * Number(ln.unitPrice);
        agg.set(ln.itemId, entry);
      }
    }

    if (agg.size === 0) {
      return {
        from: fromStr ?? null,
        to: toStr ?? null,
        rows: [],
      };
    }

    const items = await this.items.find({
      where: { id: In(Array.from(agg.keys())) },
    });
    const byId = new Map(items.map((i) => [i.id, i]));

    // COGS per item = sum of (qty × costAtSaleTime) across every sale line
    // in the period. costAtSaleTime is the snapshot of the weighted-average
    // cost at the moment the sale was rung up — the right answer for
    // historical margin reports (item.purchasePrice would shift with the
    // most recent purchase and rewrite history).
    const cogsByItem = new Map<string, number>();
    for (const ln of saleLines) {
      const cur = cogsByItem.get(ln.itemId) ?? 0;
      cogsByItem.set(
        ln.itemId,
        cur + Number(ln.quantity) * Number(ln.costAtSaleTime ?? 0),
      );
    }
    for (const r of saleReturns) {
      for (const ln of r.lines ?? []) {
        // Sale returns net out the qty + revenue; for COGS we'd need to
        // know the original line's cost. The matching SaleItem has it but
        // joining here is overkill — fall back to the item's current avgCost
        // which is a reasonable approximation for a small shop with stable
        // costs. Materially the same as our existing reports.
        const item = byId.get(ln.itemId);
        const unit = item
          ? Number(item.avgCost) > 0
            ? Number(item.avgCost)
            : Number(item.purchasePrice)
          : 0;
        const cur = cogsByItem.get(ln.itemId) ?? 0;
        cogsByItem.set(ln.itemId, cur - Number(ln.quantity) * unit);
      }
    }

    const rows = Array.from(agg.entries())
      .map(([itemId, v]) => {
        const item = byId.get(itemId);
        const cogs = round2(cogsByItem.get(itemId) ?? 0);
        const revenue = round2(v.revenue);
        const grossProfit = round2(revenue - cogs);
        const marginPct = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;
        return {
          itemId,
          name: item?.name ?? '(deleted item)',
          sku: item?.sku ?? '—',
          qty: v.qty,
          revenue,
          cogs,
          grossProfit,
          marginPct,
        };
      })
      .sort((a, b) => b.grossProfit - a.grossProfit);

    return {
      from: fromStr ?? null,
      to: toStr ?? null,
      rows,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Trial balance — derived from journal_lines (P1 ledger)
  // ──────────────────────────────────────────────────────────

  /**
   * Sum of debits and credits per account from all journal entries dated
   * `≤ asOf`. The `balanced` flag is the headline check: every well-formed
   * journal entry posts `SUM(debit) === SUM(credit)`, so the rollup across
   * all accounts must also balance. Any divergence means a posting got past
   * the JournalService invariant — surface it loudly.
   */
  async trialBalance(asOfStr?: string): Promise<{
    asOf: string;
    rows: Array<{
      accountId: string;
      code: string | null;
      name: string;
      accountCategory: string;
      isSystem: boolean;
      debit: number;
      credit: number;
      balance: number;
    }>;
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  }> {
    const asOf = asOfStr ? new Date(asOfStr) : new Date();

    const raw = await this.journalLines
      .createQueryBuilder('ln')
      .innerJoin('ln.entry', 'je')
      .where('je.entry_date <= :asOf', { asOf })
      .select('ln.account_id', 'accountId')
      .addSelect('COALESCE(SUM(ln.debit), 0)', 'debit')
      .addSelect('COALESCE(SUM(ln.credit), 0)', 'credit')
      .groupBy('ln.account_id')
      .getRawMany<{ accountId: string; debit: string; credit: string }>();

    const accountIds = raw.map((r) => r.accountId);
    const accountList = accountIds.length
      ? await this.accounts.find({ where: { id: In(accountIds) } })
      : [];
    const byId = new Map(accountList.map((a) => [a.id, a]));

    let totalDebit = 0;
    let totalCredit = 0;
    const rows = raw
      .map((r) => {
        const acc = byId.get(r.accountId);
        const debit = Number(r.debit);
        const credit = Number(r.credit);
        totalDebit += debit;
        totalCredit += credit;
        return {
          accountId: r.accountId,
          code: acc?.code ?? null,
          name: acc?.name ?? '(deleted account)',
          accountCategory: acc?.accountCategory ?? 'ASSET',
          isSystem: acc?.isSystem ?? false,
          debit: round2(debit),
          credit: round2(credit),
          balance: round2(debit - credit),
        };
      })
      .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));

    return {
      asOf: asOf.toISOString(),
      rows,
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      balanced: Math.abs(totalDebit - totalCredit) < 0.005,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Journal-driven reports (parallel ledger)
  // ──────────────────────────────────────────────────────────

  /**
   * Aggregates `journal_lines` by account category for the given date
   * window. Used by the journal-driven Income Statement / Balance Sheet.
   *
   * Sign convention: assets / expenses are debit-natured so the natural
   * balance is `debit - credit`; liabilities / equity / income are credit-
   * natured so the natural balance is `credit - debit`. The returned values
   * follow each category's natural sign so a positive number is what the
   * reader expects.
   */
  private async balancesByCategory(opts: {
    from?: Date;
    to?: Date;
  }): Promise<{
    asset: number;
    liability: number;
    equity: number;
    income: number;
    expense: number;
  }> {
    const qb = this.journalLines
      .createQueryBuilder('ln')
      .innerJoin('ln.entry', 'je')
      .innerJoin(Account, 'a', 'a.id = ln.account_id')
      .select('a.account_category', 'category')
      .addSelect('COALESCE(SUM(ln.debit), 0)', 'debit')
      .addSelect('COALESCE(SUM(ln.credit), 0)', 'credit')
      .groupBy('a.account_category');
    if (opts.from) qb.andWhere('je.entry_date >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('je.entry_date <= :to', { to: opts.to });

    const rows = await qb.getRawMany<{
      category: string;
      debit: string;
      credit: string;
    }>();

    const out = { asset: 0, liability: 0, equity: 0, income: 0, expense: 0 };
    for (const r of rows) {
      const d = Number(r.debit);
      const c = Number(r.credit);
      switch (r.category) {
        case 'ASSET':     out.asset     = round2(d - c); break;
        case 'LIABILITY': out.liability = round2(c - d); break;
        case 'EQUITY':    out.equity    = round2(c - d); break;
        case 'INCOME':    out.income    = round2(c - d); break;
        case 'EXPENSE':   out.expense   = round2(d - c); break;
      }
    }
    return out;
  }

  /**
   * Income Statement derived from `journal_lines`. Revenue is the sum of
   * INCOME-category credits; COGS+OpEx is the sum of EXPENSE-category
   * debits; netIncome = income - expense.
   *
   * Parallel to `incomeStatement()` which still derives from operational
   * tables. Run them both, compare totals — divergence means a posting
   * went sideways and needs investigation.
   */
  async incomeStatementFromJournals(
    fromStr?: string,
    toStr?: string,
  ): Promise<{
    from: string | null;
    to: string | null;
    revenue: number;
    expense: number;
    netIncome: number;
    source: 'journals';
  }> {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    const b = await this.balancesByCategory({ from, to });
    return {
      from: fromStr ?? null,
      to: toStr ?? null,
      revenue: b.income,
      expense: b.expense,
      netIncome: round2(b.income - b.expense),
      source: 'journals',
    };
  }

  /**
   * Balance Sheet derived from `journal_lines`. Equity here includes
   * `current period earnings` = income − expense for the period up to
   * `asOf`, since journals don't auto-close retained earnings.
   *
   * Identity check: `assets === liabilities + equity + earnings`. Surfaced
   * as `balanced` so the UI can flag a problem at-a-glance.
   */
  async balanceSheetFromJournals(asOfStr?: string): Promise<{
    asOf: string;
    assets: number;
    liabilities: number;
    equity: number;
    currentPeriodEarnings: number;
    totalLiabilitiesAndEquity: number;
    balanced: boolean;
    source: 'journals';
  }> {
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    const b = await this.balancesByCategory({ to: asOf });
    const earnings = round2(b.income - b.expense);
    const totalLE = round2(b.liability + b.equity + earnings);
    return {
      asOf: asOf.toISOString(),
      assets: b.asset,
      liabilities: b.liability,
      equity: b.equity,
      currentPeriodEarnings: earnings,
      totalLiabilitiesAndEquity: totalLE,
      balanced: Math.abs(b.asset - totalLE) < 0.005,
      source: 'journals',
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Slow-moving stock + margin analytics (operational business decisions)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * For every item that's still on hand, returns the days since the last
   * sale movement (or "never" if it's never sold) and the inventory value
   * locked at the current weighted-average cost. Sorted so the deadest
   * stock is on top.
   *
   * Buckets:
   *   - `fresh`        — sold within the last 30 days
   *   - `slowing`      — 31–60 days since last sale
   *   - `cold`         — 61–90 days
   *   - `dead`         — > 90 days OR never sold but still in stock
   */
  async slowMovingStock(asOfStr?: string): Promise<{
    asOf: string;
    rows: Array<{
      itemId: string;
      name: string;
      sku: string;
      onHand: number;
      avgCost: number;
      valueAtCost: number;
      daysSinceLastSale: number | null;
      bucket: 'fresh' | 'slowing' | 'cold' | 'dead';
    }>;
    summary: {
      fresh: number;
      slowing: number;
      cold: number;
      dead: number;
      deadValue: number;
      coldValue: number;
    };
  }> {
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    const items = await this.items.find({ where: { isActive: true } });
    // Last sale per item — pulled in one indexed pass over sale_items joined
    // on sales.createdAt. For our row counts this fits comfortably in memory.
    const lines = await this.saleItems
      .createQueryBuilder('sl')
      .leftJoin('sl.sale', 's')
      .where('s.reversedAt IS NULL')
      .andWhere('s.createdAt <= :asOf', { asOf })
      .select('sl.itemId', 'itemId')
      .addSelect('MAX(s.createdAt)', 'lastSold')
      .groupBy('sl.itemId')
      .getRawMany<{ itemId: string; lastSold: string | Date }>();
    const lastSoldByItem = new Map(
      lines.map((r) => [r.itemId, new Date(r.lastSold)]),
    );

    const rows: {
      itemId: string;
      name: string;
      sku: string;
      onHand: number;
      avgCost: number;
      valueAtCost: number;
      daysSinceLastSale: number | null;
      bucket: 'fresh' | 'slowing' | 'cold' | 'dead';
    }[] = [];
    const summary = {
      fresh: 0,
      slowing: 0,
      cold: 0,
      dead: 0,
      deadValue: 0,
      coldValue: 0,
    };

    for (const it of items) {
      const onHand = Number(it.costedQty) || 0;
      if (onHand <= 0) continue;
      const avgCost =
        Number(it.avgCost) > 0
          ? Number(it.avgCost)
          : Number(it.purchasePrice) || 0;
      const valueAtCost = round2(onHand * avgCost);
      const lastSold = lastSoldByItem.get(it.id);
      const days = lastSold
        ? Math.floor(
            (asOf.getTime() - lastSold.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null;
      let bucket: 'fresh' | 'slowing' | 'cold' | 'dead';
      if (days == null || days > 90) bucket = 'dead';
      else if (days <= 30) bucket = 'fresh';
      else if (days <= 60) bucket = 'slowing';
      else bucket = 'cold';
      summary[bucket] += 1;
      if (bucket === 'dead') summary.deadValue += valueAtCost;
      if (bucket === 'cold') summary.coldValue += valueAtCost;
      rows.push({
        itemId: it.id,
        name: it.name,
        sku: it.sku,
        onHand,
        avgCost: round2(avgCost),
        valueAtCost,
        daysSinceLastSale: days,
        bucket,
      });
    }

    // Worst first — dead by descending value, then cold, then slowing, then
    // fresh. Within a bucket the longest-since-sold wins.
    const order: Record<string, number> = {
      dead: 0,
      cold: 1,
      slowing: 2,
      fresh: 3,
    };
    rows.sort((a, b) => {
      if (a.bucket !== b.bucket) return order[a.bucket] - order[b.bucket];
      return (b.daysSinceLastSale ?? 9999) - (a.daysSinceLastSale ?? 9999);
    });

    summary.deadValue = round2(summary.deadValue);
    summary.coldValue = round2(summary.coldValue);

    return { asOf: asOf.toISOString(), rows, summary };
  }

  /**
   * Margin analytics for the Financials → Margins tab. Three slices over
   * the chosen period:
   *
   *   - `byBrand`              — qty / revenue / cogs / margin% per brand
   *   - `lowestMarginSales`    — 20 worst-margin individual sale lines,
   *                              flagged for owner review
   *   - `highDiscountSales`    — 20 sales with the largest header discount
   *
   * Used to spot pricing leaks ("salesman gave 30% off a CIF unit") rather
   * than to lock anything down — the philosophy here is observation, not
   * control.
   */
  async marginAnalytics(fromStr?: string, toStr?: string): Promise<{
    from: string | null;
    to: string | null;
    byBrand: Array<{
      brandId: string | null;
      brandName: string;
      qty: number;
      revenue: number;
      cogs: number;
      grossProfit: number;
      marginPct: number;
    }>;
    lowestMarginSales: Array<{
      saleId: string;
      invoiceNo: string;
      createdAt: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      costAtSaleTime: number;
      marginPct: number;
    }>;
    highDiscountSales: Array<{
      saleId: string;
      invoiceNo: string;
      createdAt: string;
      customerName: string;
      totalAmount: number;
      discount: number;
      discountPct: number;
    }>;
  }> {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    const dateBetween =
      from && to
        ? Between(from, to)
        : from
          ? Between(from, new Date('9999-12-31'))
          : to
            ? Between(new Date(0), to)
            : undefined;

    const sales = await this.sales.find({
      where: dateBetween ? { createdAt: dateBetween } : {},
      order: { createdAt: 'DESC' },
    });
    const saleIds = sales.map((s) => s.id);
    const lines = saleIds.length
      ? await this.saleItems.find({ where: { saleId: In(saleIds) } })
      : [];
    const items = await this.items.find({
      where: { id: In(Array.from(new Set(lines.map((l) => l.itemId)))) },
      relations: ['brand'],
    });
    const itemById = new Map(items.map((i) => [i.id, i]));
    const saleById = new Map(sales.map((s) => [s.id, s]));

    // Brand-level aggregation
    const brandAgg = new Map<
      string,
      { brandId: string | null; brandName: string; qty: number; revenue: number; cogs: number }
    >();
    const lineMargins: Array<{
      saleId: string;
      itemId: string;
      quantity: number;
      unitPrice: number;
      costAtSaleTime: number;
      marginPct: number;
    }> = [];

    for (const ln of lines) {
      const it = itemById.get(ln.itemId);
      const brandId = it?.brandId ?? null;
      const brandName = it?.brand?.name ?? '— Unbranded —';
      const key = brandId ?? '__none__';
      const cur =
        brandAgg.get(key) ??
        { brandId, brandName, qty: 0, revenue: 0, cogs: 0 };
      cur.qty += Number(ln.quantity);
      cur.revenue += Number(ln.lineTotal);
      cur.cogs += Number(ln.quantity) * Number(ln.costAtSaleTime ?? 0);
      brandAgg.set(key, cur);

      const unitCost = Number(ln.costAtSaleTime ?? 0);
      const unitPrice = Number(ln.unitPrice ?? 0);
      const marginPct =
        unitPrice > 0
          ? round2(((unitPrice - unitCost) / unitPrice) * 100)
          : 0;
      lineMargins.push({
        saleId: ln.saleId,
        itemId: ln.itemId,
        quantity: Number(ln.quantity),
        unitPrice,
        costAtSaleTime: unitCost,
        marginPct,
      });
    }

    const byBrand = Array.from(brandAgg.values())
      .map((b) => {
        const gp = round2(b.revenue - b.cogs);
        const mp = b.revenue > 0 ? round2((gp / b.revenue) * 100) : 0;
        return {
          brandId: b.brandId,
          brandName: b.brandName,
          qty: b.qty,
          revenue: round2(b.revenue),
          cogs: round2(b.cogs),
          grossProfit: gp,
          marginPct: mp,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const lowestMarginSales = lineMargins
      .filter((l) => l.unitPrice > 0)
      .sort((a, b) => a.marginPct - b.marginPct)
      .slice(0, 20)
      .map((l) => {
        const s = saleById.get(l.saleId);
        const it = itemById.get(l.itemId);
        return {
          saleId: l.saleId,
          invoiceNo: s?.invoiceNo ?? '?',
          createdAt: s?.createdAt.toISOString() ?? '',
          itemName: it?.name ?? l.itemId,
          quantity: l.quantity,
          unitPrice: round2(l.unitPrice),
          costAtSaleTime: round2(l.costAtSaleTime),
          marginPct: l.marginPct,
        };
      });

    const highDiscountSales = sales
      .filter((s) => Number(s.discount) > 0 && Number(s.totalAmount) > 0)
      .sort((a, b) => Number(b.discount) - Number(a.discount))
      .slice(0, 20)
      .map((s) => ({
        saleId: s.id,
        invoiceNo: s.invoiceNo,
        createdAt: s.createdAt.toISOString(),
        customerName: s.customer?.name ?? 'Walk-in',
        totalAmount: round2(Number(s.totalAmount)),
        discount: round2(Number(s.discount)),
        discountPct: round2(
          (Number(s.discount) / Number(s.totalAmount)) * 100,
        ),
      }));

    return {
      from: fromStr ?? null,
      to: toStr ?? null,
      byBrand,
      lowestMarginSales,
      highDiscountSales,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Product sales history + who-bought-what (operational sales analytics)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Build an inclusive [from 00:00, to 23:59:59.999] createdAt clause from
   * date-only (YYYY-MM-DD) query strings. Unlike the legacy `buildDateWhere`
   * (which uses the raw `new Date(to)` = midnight and so drops most of the
   * "to" day), this treats `to` as end-of-day so a report run "up to today"
   * includes today's sales — the behaviour a shop owner expects.
   */
  private dayInclusiveWhere(from?: string, to?: string) {
    const fromDate = from ? new Date(`${from}T00:00:00.000`) : undefined;
    const toDate = to ? new Date(`${to}T23:59:59.999`) : undefined;
    if (fromDate && toDate) return Between(fromDate, toDate);
    if (fromDate) return MoreThanOrEqual(fromDate);
    if (toDate) return LessThanOrEqual(toDate);
    return undefined;
  }

  /**
   * Sales-by-product summary, grouped by category. For every item sold in the
   * window (optionally narrowed to one category or brand) returns units sold,
   * revenue, COGS (snapshotted `costAtSaleTime`), gross profit and margin %,
   * then rolls the items up under their category with per-category subtotals
   * and a grand total.
   *
   * Netting: reversed sales are excluded outright (`reversedAt IS NULL`) and
   * sale returns are subtracted from qty/revenue/COGS (returns COGS uses the
   * item's current avg cost as a stand-in, matching `itemMargins`).
   *
   * Category assignment: an item can belong to several categories (M2M). Each
   * item is charged to ONE representative category so revenue isn't double
   * counted — the selected category when `categoryId` is filtered, otherwise
   * the item's first category (or "Uncategorised").
   */
  async productSales(filter: {
    from?: string;
    to?: string;
    categoryId?: string;
    brandId?: string;
  }): Promise<{
    from: string | null;
    to: string | null;
    categories: Array<{
      categoryId: string | null;
      categoryName: string;
      qty: number;
      revenue: number;
      cogs: number;
      grossProfit: number;
      marginPct: number;
      items: Array<{
        itemId: string;
        name: string;
        sku: string;
        brandName: string;
        qty: number;
        revenue: number;
        cogs: number;
        grossProfit: number;
        marginPct: number;
      }>;
    }>;
    totals: {
      qty: number;
      revenue: number;
      cogs: number;
      grossProfit: number;
      marginPct: number;
    };
  }> {
    const dateWhere = this.dayInclusiveWhere(filter.from, filter.to);

    const sales = await this.sales.find({
      where: {
        ...(dateWhere ? { createdAt: dateWhere } : {}),
        reversedAt: IsNull(),
      },
    });
    const saleIds = sales.map((s) => s.id);
    const saleLines = saleIds.length
      ? await this.saleItems.find({ where: { saleId: In(saleIds) } })
      : [];
    const saleReturns = await this.saleReturns.find({
      where: dateWhere ? { createdAt: dateWhere } : {},
      relations: ['lines'],
    });

    // Aggregate qty / revenue / COGS per item.
    const agg = new Map<
      string,
      { qty: number; revenue: number; cogs: number }
    >();
    const bump = (
      itemId: string,
      qty: number,
      revenue: number,
      cogs: number,
    ) => {
      const e = agg.get(itemId) ?? { qty: 0, revenue: 0, cogs: 0 };
      e.qty += qty;
      e.revenue += revenue;
      e.cogs += cogs;
      agg.set(itemId, e);
    };
    for (const ln of saleLines) {
      bump(
        ln.itemId,
        Number(ln.quantity),
        Number(ln.lineTotal),
        Number(ln.quantity) * Number(ln.costAtSaleTime ?? 0),
      );
    }

    if (agg.size === 0) {
      return {
        from: filter.from ?? null,
        to: filter.to ?? null,
        categories: [],
        totals: { qty: 0, revenue: 0, cogs: 0, grossProfit: 0, marginPct: 0 },
      };
    }

    // Load the sold items with their eager brand + categories so we can both
    // net returns (needs avg cost) and group by category.
    const soldItems = await this.items.find({
      where: { id: In(Array.from(agg.keys())) },
    });
    const itemById = new Map(soldItems.map((i) => [i.id, i]));

    for (const r of saleReturns) {
      for (const ln of r.lines ?? []) {
        if (!agg.has(ln.itemId)) continue; // returned an item that didn't sell in-window
        const it = itemById.get(ln.itemId);
        const unitCost = it
          ? Number(it.avgCost) > 0
            ? Number(it.avgCost)
            : Number(it.purchasePrice)
          : 0;
        bump(
          ln.itemId,
          -Number(ln.quantity),
          -Number(ln.quantity) * Number(ln.unitPrice),
          -Number(ln.quantity) * unitCost,
        );
      }
    }

    // Optional scope narrowing (category / brand). itemId isn't offered here —
    // a single-item "summary" is just its margin row, use item-margins instead.
    let allowed: Set<string> | null = null;
    if (filter.categoryId || filter.brandId) {
      const ids = await this.resolveItemIds({
        categoryId: filter.categoryId,
        brandId: filter.brandId,
      });
      allowed = new Set(ids ?? []);
    }

    // Group items under a single representative category.
    type CatBucket = {
      categoryId: string | null;
      categoryName: string;
      qty: number;
      revenue: number;
      cogs: number;
      items: Array<{
        itemId: string;
        name: string;
        sku: string;
        brandName: string;
        qty: number;
        revenue: number;
        cogs: number;
        grossProfit: number;
        marginPct: number;
      }>;
    };
    const buckets = new Map<string, CatBucket>();
    const totals = { qty: 0, revenue: 0, cogs: 0 };

    for (const [itemId, v] of agg.entries()) {
      if (allowed && !allowed.has(itemId)) continue;
      const it = itemById.get(itemId);

      let catId: string | null;
      let catName: string;
      if (filter.categoryId) {
        catId = filter.categoryId;
        catName =
          it?.categories?.find((c) => c.id === filter.categoryId)?.name ??
          'Selected category';
      } else {
        const first = it?.categories?.[0];
        catId = first?.id ?? null;
        catName = first?.name ?? 'Uncategorised';
      }

      const key = catId ?? '__none__';
      const bucket =
        buckets.get(key) ??
        ({
          categoryId: catId,
          categoryName: catName,
          qty: 0,
          revenue: 0,
          cogs: 0,
          items: [],
        } as CatBucket);

      const revenue = round2(v.revenue);
      const cogs = round2(v.cogs);
      const grossProfit = round2(revenue - cogs);
      bucket.qty += v.qty;
      bucket.revenue += revenue;
      bucket.cogs += cogs;
      bucket.items.push({
        itemId,
        name: it?.name ?? '(deleted item)',
        sku: it?.sku ?? '—',
        brandName: it?.brand?.name ?? '—',
        qty: v.qty,
        revenue,
        cogs,
        grossProfit,
        marginPct: revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
      });
      buckets.set(key, bucket);

      totals.qty += v.qty;
      totals.revenue += revenue;
      totals.cogs += cogs;
    }

    const categories = Array.from(buckets.values())
      .map((b) => {
        const revenue = round2(b.revenue);
        const cogs = round2(b.cogs);
        const grossProfit = round2(revenue - cogs);
        return {
          categoryId: b.categoryId,
          categoryName: b.categoryName,
          qty: b.qty,
          revenue,
          cogs,
          grossProfit,
          marginPct: revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
          items: b.items.sort((a, c) => c.revenue - a.revenue),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const grandRevenue = round2(totals.revenue);
    const grandCogs = round2(totals.cogs);
    const grandProfit = round2(grandRevenue - grandCogs);

    return {
      from: filter.from ?? null,
      to: filter.to ?? null,
      categories,
      totals: {
        qty: totals.qty,
        revenue: grandRevenue,
        cogs: grandCogs,
        grossProfit: grandProfit,
        marginPct: grandRevenue > 0 ? round2((grandProfit / grandRevenue) * 100) : 0,
      },
    };
  }

  /**
   * "Who bought this?" — for a product scope (a specific item, or every item
   * in a category / brand) list each customer that bought within the window
   * with the units they took, how many separate invoices they bought it on,
   * and their total spend on the scope. Sorted by units desc.
   *
   * Walk-in / no-customer sales are collapsed into a single labelled row so
   * the totals reconcile with the product-sales summary. Reversed sales are
   * excluded. This is a gross-purchases view (returns are not netted) — the
   * question is "who has ever bought this", and a later return doesn't unmake
   * them a buyer.
   */
  async customersByProduct(filter: {
    itemId?: string;
    categoryId?: string;
    brandId?: string;
    from?: string;
    to?: string;
  }): Promise<{
    scope: {
      type: 'item' | 'category' | 'brand' | 'all';
      id: string | null;
      label: string;
    };
    from: string | null;
    to: string | null;
    rows: Array<{
      customerId: string | null;
      name: string;
      phone: string | null;
      qty: number;
      invoices: number;
      spend: number;
    }>;
    totals: { customers: number; qty: number; invoices: number; spend: number };
  }> {
    // Resolve the scope label + the item ids it covers.
    let scope: {
      type: 'item' | 'category' | 'brand' | 'all';
      id: string | null;
      label: string;
    } = { type: 'all', id: null, label: 'All products' };
    if (filter.itemId) {
      const it = await this.items.findOne({ where: { id: filter.itemId } });
      scope = {
        type: 'item',
        id: filter.itemId,
        label: it ? `${it.name} (${it.sku})` : filter.itemId,
      };
    } else if (filter.categoryId) {
      const c = await this.categories.findOne({
        where: { id: filter.categoryId },
      });
      scope = {
        type: 'category',
        id: filter.categoryId,
        label: c ? c.name : filter.categoryId,
      };
    } else if (filter.brandId) {
      const b = await this.brands.findOne({ where: { id: filter.brandId } });
      scope = {
        type: 'brand',
        id: filter.brandId,
        label: b ? b.name : filter.brandId,
      };
    }

    const itemIds = await this.resolveItemIds({
      itemId: filter.itemId,
      categoryId: filter.categoryId,
      brandId: filter.brandId,
    });
    const empty = {
      scope,
      from: filter.from ?? null,
      to: filter.to ?? null,
      rows: [],
      totals: { customers: 0, qty: 0, invoices: 0, spend: 0 },
    };
    // A scope was requested but matched no items → no buyers, short-circuit.
    if (itemIds && itemIds.length === 0) return empty;

    const qb = this.saleItems
      .createQueryBuilder('sl')
      .innerJoin('sl.sale', 's')
      .select('s.customer_id', 'customerId')
      .addSelect('COALESCE(SUM(sl.quantity), 0)', 'qty')
      .addSelect('COUNT(DISTINCT s.id)', 'invoices')
      .addSelect('COALESCE(SUM(sl.line_total), 0)', 'spend')
      .where('s.reversed_at IS NULL')
      .groupBy('s.customer_id');
    if (itemIds) qb.andWhere('sl.item_id IN (:...ids)', { ids: itemIds });
    if (filter.from) {
      qb.andWhere('s.created_at >= :from', {
        from: new Date(`${filter.from}T00:00:00.000`),
      });
    }
    if (filter.to) {
      qb.andWhere('s.created_at <= :to', {
        to: new Date(`${filter.to}T23:59:59.999`),
      });
    }

    const raw = await qb.getRawMany<{
      customerId: string | null;
      qty: string;
      invoices: string;
      spend: string;
    }>();

    // Resolve customer names/phones in one trip.
    const customerIds = raw
      .map((r) => r.customerId)
      .filter((id): id is string => !!id);
    const customerList = customerIds.length
      ? await this.customers.find({ where: { id: In(customerIds) } })
      : [];
    const byId = new Map(customerList.map((c) => [c.id, c]));

    const rows = raw
      .map((r) => {
        const c = r.customerId ? byId.get(r.customerId) : undefined;
        return {
          customerId: r.customerId ?? null,
          name: r.customerId
            ? (c?.name ?? '(deleted customer)')
            : 'Walk-in / no customer',
          phone: c?.phone ?? null,
          qty: Number(r.qty),
          invoices: Number(r.invoices),
          spend: round2(Number(r.spend)),
        };
      })
      .sort((a, b) => b.qty - a.qty || b.spend - a.spend);

    return {
      scope,
      from: filter.from ?? null,
      to: filter.to ?? null,
      rows,
      totals: {
        customers: rows.length,
        qty: rows.reduce((s, r) => s + r.qty, 0),
        invoices: rows.reduce((s, r) => s + r.invoices, 0),
        spend: round2(rows.reduce((s, r) => s + r.spend, 0)),
      },
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function labelForType(t: string): string {
  switch (t) {
    case 'SALARY_ACCRUED': return 'Salary accrued (we owe)';
    case 'SALARY': return 'Salary payment';
    case 'ADVANCE': return 'Advance';
    case 'REIMBURSEMENT': return 'Reimbursement';
    case 'EXPENSE': return 'Shop expense paid by employee';
    case 'INCENTIVE_PAYOUT': return 'Incentive payout';
    case 'ADJUSTMENT': return 'Adjustment';
    default: return t;
  }
}
