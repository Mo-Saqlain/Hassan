import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
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
import { EmployeeIncentivesService } from '../employee-incentives/employee-incentives.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeTransaction } from '../employee-transactions/entities/employee-transaction.entity';

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
    private readonly employeeIncentives: EmployeeIncentivesService,
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(EmployeeTransaction)
    private readonly employeeTxns: Repository<EmployeeTransaction>,
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
      // SALARY_ACCRUED is a debit — booking the monthly obligation increases
      // what we owe the employee. SALARY / ADVANCE / REIMBURSEMENT / EXPENSE /
      // INCENTIVE_PAYOUT are credits (money moves out of the shop to the
      // employee, settling what we owed). ADJUSTMENT is a credit by default;
      // users wanting to add to our liability can use a SALARY_ACCRUED-style
      // adjustment if needed.
      const amount = Number(t.amount);
      const isDebit = t.type === 'SALARY_ACCRUED';
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
      const map = r.type === 'SALARY_ACCRUED' ? debits : credits;
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
   * All customers with their current A/R balance.
   *
   * Batched: instead of running `customerLedger` per customer (4 queries each
   * → 4N+1), we run four GROUP-BY-customer aggregates and combine in JS.
   * Mirrors the same +debit / -credit math as `customerLedger`:
   *   balance = opening + sales.net − sales.paid − returns.total − receipts.amount
   */
  async allCustomerBalances() {
    const list = await this.customers.find({ order: { name: 'ASC' } });
    if (list.length === 0) return [];

    const [saleSums, returnSums, receiptSums] = await Promise.all([
      this.sales
        .createQueryBuilder('s')
        .select('s.customer_id', 'cid')
        .addSelect('COALESCE(SUM(s.net_amount), 0)', 'net')
        .addSelect('COALESCE(SUM(s.paid_amount), 0)', 'paid')
        .where('s.customer_id IS NOT NULL')
        .groupBy('s.customer_id')
        .getRawMany(),
      this.saleReturns
        .createQueryBuilder('r')
        .select('r.customer_id', 'cid')
        .addSelect('COALESCE(SUM(r.total_amount), 0)', 'total')
        .where('r.customer_id IS NOT NULL')
        .groupBy('r.customer_id')
        .getRawMany(),
      this.payments
        .createQueryBuilder('p')
        .select('p.customer_id', 'cid')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.direction = :d', { d: 'IN' })
        .andWhere('p.customer_id IS NOT NULL')
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
   * All suppliers with their current A/P balance.
   *
   * Batched: same approach as `allCustomerBalances`. Mirrors `supplierLedger`'s
   * +credit / -debit math:
   *   balance = opening + purchases.net − purchases.paid − returns.total − payments.amount
   */
  async allSupplierBalances() {
    const list = await this.suppliers.find({ order: { name: 'ASC' } });
    if (list.length === 0) return [];

    const [purchaseSums, returnSums, paymentSums] = await Promise.all([
      this.purchases
        .createQueryBuilder('p')
        .select('p.supplier_id', 'sid')
        .addSelect('COALESCE(SUM(p.net_amount), 0)', 'net')
        .addSelect('COALESCE(SUM(p.paid_amount), 0)', 'paid')
        .where('p.supplier_id IS NOT NULL')
        .groupBy('p.supplier_id')
        .getRawMany(),
      this.purchaseReturns
        .createQueryBuilder('r')
        .select('r.supplier_id', 'sid')
        .addSelect('COALESCE(SUM(r.total_amount), 0)', 'total')
        .where('r.supplier_id IS NOT NULL')
        .groupBy('r.supplier_id')
        .getRawMany(),
      this.payments
        .createQueryBuilder('p')
        .select('p.supplier_id', 'sid')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.direction = :d', { d: 'OUT' })
        .andWhere('p.supplier_id IS NOT NULL')
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

    // Run the five reads we need to even start (accounts, items, customers,
    // suppliers, the per-account payment sums) in parallel. Each sub-result
    // is in turn computed without per-row N+1.
    const [accounts, items, customers, suppliers, paySums, transferDelta, saleAcctSums] =
      await Promise.all([
        this.accounts.find(),
        this.items.find(),
        this.customers.find(),
        this.suppliers.find(),
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

    // A/R and A/P: customer + supplier ledgers fanned out concurrently. The
    // per-party ledger queries are still N+1, but at least they're parallel
    // now. Future work: a fully batched as-of variant of
    // allCustomerBalances/allSupplierBalances.
    const [arBalances, apBalances] = await Promise.all([
      Promise.all(customers.map((c) => this.customerLedger(c.id, asOfDate))),
      Promise.all(suppliers.map((s) => this.supplierLedger(s.id, asOfDate))),
    ]);
    const accountsReceivable = arBalances.reduce(
      (s, l) => s + Number(l.closingBalance),
      0,
    );
    const accountsPayable = apBalances.reduce(
      (s, l) => s + Number(l.closingBalance),
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
