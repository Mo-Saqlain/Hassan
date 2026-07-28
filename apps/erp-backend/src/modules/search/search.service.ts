import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { applySearch } from '../../common/search';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Account } from '../accounts/entities/account.entity';
import { Item } from '../items/entities/item.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { PurchaseReturn } from '../returns/entities/purchase-return.entity';
import { Payment } from '../payments/entities/payment.entity';
import { StockTransfer } from '../stock-transfers/entities/stock-transfer.entity';
import { FundTransfer } from '../fund-transfers/entities/fund-transfer.entity';
import { ServiceTicket } from '../service-tickets/entities/service-ticket.entity';
import { Delivery } from '../deliveries/entities/delivery.entity';

/** One hit, shaped for direct rendering by the global search palette. */
export interface SearchHit {
  kind: string;
  id: string;
  label: string;
  sub?: string;
  amount?: number;
  route?: string;
  reversed?: boolean;
}

export interface GlobalSearchResult {
  query: string;
  total: number;
  groups: Array<{ kind: string; title: string; hits: SearchHit[] }>;
}

const money = (n: unknown) => Number(n ?? 0);

/**
 * One search across everything the shop can look up by name or by document
 * number.
 *
 * Server-side on purpose. The palette used to pull five whole tables into the
 * browser on every open and filter them in JS, which meant it could only ever
 * cover master data — an invoice number was unfindable anywhere in the app — and
 * got slower with every item added. Matching in SQL also means one query per
 * table with a LIMIT instead of a full table transfer.
 */
@Injectable()
export class SearchService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async global(query: string, perGroup = 6): Promise<GlobalSearchResult> {
    const q = (query ?? '').trim();
    if (q.length < 2) return { query: q, total: 0, groups: [] };

    const [
      customers, suppliers, employees, accounts, items,
      sales, purchases, saleReturns, purchaseReturns, payments,
      stockTransfers, fundTransfers, tickets, deliveries,
    ] = await Promise.all([
      this.hits(Customer, 'c', ['c.name', 'c.phone', 'c.code', 'c.address'], q, perGroup),
      this.hits(Supplier, 's', ['s.name', 's.phone', 's.code'], q, perGroup),
      this.hits(Employee, 'e', ['e.name', 'e.phone', 'e.code'], q, perGroup),
      this.hits(Account, 'a', ['a.name', 'a.code'], q, perGroup),
      this.hits(Item, 'i', ['i.name', 'i.sku', 'i.barcode', 'i.model_no'], q, perGroup),
      this.hits(Sale, 'x', ['x.invoice_no', 'x.notes'], q, perGroup, ['customer']),
      this.hits(Purchase, 'x', ['x.bill_no', 'x.notes'], q, perGroup, ['supplier']),
      this.hits(SaleReturn, 'x', ['x.return_no', 'x.reason'], q, perGroup, ['customer']),
      this.hits(PurchaseReturn, 'x', ['x.return_no', 'x.reason'], q, perGroup, ['supplier']),
      this.hits(Payment, 'x', ['x.voucher_no', 'x.notes'], q, perGroup, [
        'customer',
        'supplier',
        'expenseAccount',
      ]),
      this.hits(StockTransfer, 'x', ['x.transfer_no', 'x.notes'], q, perGroup),
      this.hits(FundTransfer, 'x', ['x.transfer_no', 'x.notes'], q, perGroup),
      this.hits(ServiceTicket, 'x', ['x.ticket_no', 'x.complaint'], q, perGroup),
      this.hits(Delivery, 'x', ['x.delivery_no', 'x.address', 'x.phone'], q, perGroup),
    ]);

    const groups = [
      { kind: 'customer', title: 'Customers', hits: customers.map((r: any) => ({
        kind: 'customer', id: r.id, label: r.name,
        sub: [r.code, r.phone].filter(Boolean).join(' · '),
        route: `/customer-ledger/${r.id}`,
      })) },
      { kind: 'supplier', title: 'Suppliers', hits: suppliers.map((r: any) => ({
        kind: 'supplier', id: r.id, label: r.name,
        sub: [r.code, r.phone].filter(Boolean).join(' · '),
        route: `/supplier-ledger/${r.id}`,
      })) },
      { kind: 'employee', title: 'Employees', hits: employees.map((r: any) => ({
        kind: 'employee', id: r.id, label: r.name,
        sub: [r.code, r.phone].filter(Boolean).join(' · '),
        route: `/employee-ledger/${r.id}`,
      })) },
      { kind: 'account', title: 'Accounts', hits: accounts.map((r: any) => ({
        kind: 'account', id: r.id, label: r.name, sub: r.code,
        route: `/account-ledger/${r.id}`,
      })) },
      { kind: 'item', title: 'Items', hits: items.map((r: any) => ({
        kind: 'item', id: r.id, label: r.name,
        sub: [r.sku, r.modelNo].filter(Boolean).join(' · '),
        route: '/items',
      })) },
      { kind: 'sale', title: 'Sales', hits: sales.map((r: any) => ({
        kind: 'sale', id: r.id, label: r.invoiceNo,
        sub: r.customer?.name ?? 'Walk-in',
        amount: money(r.netAmount), reversed: !!r.reversedAt,
        route: '/sales',
      })) },
      { kind: 'purchase', title: 'Purchase bills', hits: purchases.map((r: any) => ({
        kind: 'purchase', id: r.id, label: r.billNo,
        sub: r.supplier?.name, amount: money(r.netAmount),
        reversed: !!r.reversedAt, route: '/purchases',
      })) },
      { kind: 'saleReturn', title: 'Sale returns', hits: saleReturns.map((r: any) => ({
        kind: 'saleReturn', id: r.id, label: r.returnNo,
        sub: r.customer?.name, amount: money(r.totalAmount),
        reversed: !!r.reversedAt, route: '/sale-returns',
      })) },
      { kind: 'purchaseReturn', title: 'Purchase returns', hits: purchaseReturns.map((r: any) => ({
        kind: 'purchaseReturn', id: r.id, label: r.returnNo,
        sub: r.supplier?.name, amount: money(r.totalAmount),
        reversed: !!r.reversedAt, route: '/purchase-returns',
      })) },
      { kind: 'payment', title: 'Receipts & payments', hits: payments.map((r: any) => ({
        kind: 'payment', id: r.id, label: r.voucherNo,
        sub: r.customer?.name ?? r.supplier?.name ?? r.expenseAccount?.name,
        amount: money(r.amount), reversed: !!r.reversedAt,
        route: r.expenseAccountId ? '/expenses' : r.direction === 'IN' ? '/receipts' : '/payments',
      })) },
      { kind: 'stockTransfer', title: 'Stock transfers', hits: stockTransfers.map((r: any) => ({
        kind: 'stockTransfer', id: r.id, label: r.transferNo,
        sub: r.transferDate, reversed: !!r.reversedAt, route: '/stock-transfers',
      })) },
      { kind: 'fundTransfer', title: 'Fund transfers', hits: fundTransfers.map((r: any) => ({
        kind: 'fundTransfer', id: r.id, label: r.transferNo,
        amount: money(r.amount), reversed: !!r.reversedAt, route: '/fund-transfers',
      })) },
      { kind: 'serviceTicket', title: 'Service tickets', hits: tickets.map((r: any) => ({
        kind: 'serviceTicket', id: r.id, label: r.ticketNo,
        sub: r.status, route: '/service-tickets',
      })) },
      { kind: 'delivery', title: 'Deliveries', hits: deliveries.map((r: any) => ({
        kind: 'delivery', id: r.id, label: r.deliveryNo,
        sub: r.status, route: '/deliveries',
      })) },
    ].filter((g) => g.hits.length > 0);

    return {
      query: q,
      total: groups.reduce((sum, g) => sum + g.hits.length, 0),
      groups,
    };
  }

  /**
   * One table's matches. Newest first for documents (a voucher number search is
   * usually about something recent) and capped per group so one busy table can't
   * crowd the palette.
   */
  private async hits(
    entity: Function,
    alias: string,
    fields: string[],
    q: string,
    limit: number,
    relations: string[] = [],
  ) {
    if (!this.dataSource.hasMetadata(entity)) return [];
    const qb = this.dataSource
      .getRepository(entity)
      .createQueryBuilder(alias)
      .take(limit)
      .orderBy(`${alias}.createdAt`, 'DESC');
    // Eager relations are honoured by find(), NOT by a query builder — without
    // joining explicitly, every document hit would render its party as blank.
    for (const rel of relations) {
      qb.leftJoinAndSelect(`${alias}.${rel}`, `${alias}_${rel}`);
    }
    return applySearch(qb, q, fields).getMany();
  }
}
