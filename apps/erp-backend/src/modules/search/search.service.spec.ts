import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { SearchService } from './search.service';
import { Item } from '../items/entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Store } from '../stores/entities/store.entity';
import { Account } from '../accounts/entities/account.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { PurchaseItem } from '../purchases/entities/purchase-item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';
import { PurchaseReturn } from '../returns/entities/purchase-return.entity';
import { PurchaseReturnItem } from '../returns/entities/purchase-return-item.entity';
import { Payment } from '../payments/entities/payment.entity';
import { StockTransfer } from '../stock-transfers/entities/stock-transfer.entity';
import { StockTransferItem } from '../stock-transfers/entities/stock-transfer-item.entity';
import { FundTransfer } from '../fund-transfers/entities/fund-transfer.entity';
import { ServiceTicket } from '../service-tickets/entities/service-ticket.entity';
import { Delivery } from '../deliveries/entities/delivery.entity';
import { ItemSerial } from '../item-serials/entities/item-serial.entity';

describe('SearchService', () => {
  let search: SearchService;
  let ds: DataSource;

  const ENTITIES = [
    Item, Brand, Category, Customer, Supplier, Store, Account, Employee,
    Sale, SaleItem, Purchase, PurchaseItem, SaleReturn, SaleReturnItem,
    PurchaseReturn, PurchaseReturnItem, Payment, StockTransfer,
    StockTransferItem, FundTransfer, ServiceTicket, Delivery, ItemSerial,
  ];

  const kinds = (r: Awaited<ReturnType<SearchService['global']>>) =>
    r.groups.map((g) => g.kind);
  const hitsOf = (
    r: Awaited<ReturnType<SearchService['global']>>,
    kind: string,
  ) => r.groups.find((g) => g.kind === kind)?.hits ?? [];

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm(ENTITIES)),
        TypeOrmModule.forFeature(ENTITIES),
      ],
      providers: [SearchService],
    }).compile();
    await moduleRef.init();

    search = moduleRef.get(SearchService);
    ds = moduleRef.get(DataSource);

    const cash = await ds.getRepository(Account).save(
      ds.getRepository(Account).create({ name: 'Till', type: 'CASH' }),
    );
    const customer = await ds.getRepository(Customer).save(
      ds.getRepository(Customer).create({
        name: 'Ahmed Traders', phone: '03005551234', code: 'CUST-0001',
      }),
    );
    await ds.getRepository(Supplier).save(
      ds.getRepository(Supplier).create({ name: 'Haier Distributor' }),
    );
    await ds.getRepository(Item).save(
      ds.getRepository(Item).create({
        name: 'Inverter AC 1.5 Ton', sku: 'AC-INV-15', modelNo: 'HSU-18',
      }),
    );
    await ds.getRepository(Sale).save(
      ds.getRepository(Sale).create({
        invoiceNo: 'INV-000123', customerId: customer.id, accountId: cash.id,
        totalAmount: 90000, netAmount: 90000, paidAmount: 90000, dueAmount: 0,
        paymentMethod: 'CASH',
      }),
    );
    await ds.getRepository(Purchase).save(
      ds.getRepository(Purchase).create({
        billNo: 'BILL-000045', totalAmount: 70000, netAmount: 70000,
        paidAmount: 0, dueAmount: 70000, paymentMethod: 'CASH',
      }),
    );
    await ds.getRepository(Payment).save(
      ds.getRepository(Payment).create({
        voucherNo: 'RCT-000009', direction: 'IN', accountId: cash.id,
        customerId: customer.id, amount: 5000,
      }),
    );
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('finds a sale by its invoice number — previously unfindable anywhere', async () => {
    const res = await search.global('INV-000123');
    const hits = hitsOf(res, 'sale');
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe('INV-000123');
    expect(hits[0].sub).toBe('Ahmed Traders');
    expect(hits[0].amount).toBe(90000);
    expect(hits[0].route).toBe('/sales');
  });

  it('finds documents by partial number, case-insensitively', async () => {
    expect(hitsOf(await search.global('000045'), 'purchase')).toHaveLength(1);
    expect(hitsOf(await search.global('rct-'), 'payment')).toHaveLength(1);
    expect(hitsOf(await search.global('inv-000'), 'sale')).toHaveLength(1);
  });

  it('finds parties by name, phone or code and items by sku or model', async () => {
    expect(hitsOf(await search.global('ahmed'), 'customer')).toHaveLength(1);
    expect(hitsOf(await search.global('5551234'), 'customer')).toHaveLength(1);
    expect(hitsOf(await search.global('CUST-0001'), 'customer')).toHaveLength(1);
    expect(hitsOf(await search.global('haier'), 'supplier')).toHaveLength(1);
    expect(hitsOf(await search.global('AC-INV'), 'item')).toHaveLength(1);
    expect(hitsOf(await search.global('hsu-18'), 'item')).toHaveLength(1);
  });

  it('returns several kinds at once and counts them', async () => {
    // "00" appears in the invoice, the bill and the receipt numbers.
    const res = await search.global('00');
    expect(kinds(res)).toEqual(
      expect.arrayContaining(['sale', 'purchase', 'payment']),
    );
    expect(res.total).toBe(
      res.groups.reduce((sum, g) => sum + g.hits.length, 0),
    );
  });

  it('ignores a query shorter than two characters', async () => {
    expect((await search.global('a')).groups).toHaveLength(0);
    expect((await search.global('')).total).toBe(0);
    expect((await search.global('   ')).total).toBe(0);
  });

  it('omits empty groups instead of returning a shell for every table', async () => {
    const res = await search.global('INV-000123');
    expect(kinds(res)).toEqual(['sale']);
  });

  it('flags a reversed document so a hit is not mistaken for a live one', async () => {
    const repo = ds.getRepository(Sale);
    const sale = await repo.findOneByOrFail({ invoiceNo: 'INV-000123' });
    sale.reversedAt = new Date();
    sale.reversalReason = 'keyed twice';
    await repo.save(sale);

    expect(hitsOf(await search.global('INV-000123'), 'sale')[0].reversed).toBe(true);
  });

  it('caps hits per group so one busy table cannot crowd the results', async () => {
    const repo = ds.getRepository(Customer);
    for (let i = 0; i < 12; i += 1) {
      await repo.save(repo.create({ name: `Bulk Customer ${i}` }));
    }
    expect(hitsOf(await search.global('bulk'), 'customer')).toHaveLength(6);
    expect(
      hitsOf(await search.global('bulk', 10), 'customer'),
    ).toHaveLength(10);
  });

  it('treats a term with no matches as an empty result, not an error', async () => {
    const res = await search.global('zzzzzz-nothing');
    expect(res.total).toBe(0);
    expect(res.groups).toHaveLength(0);
  });
});
