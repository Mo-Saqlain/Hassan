import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { Item } from '../items/entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Store } from '../stores/entities/store.entity';
import { Account } from '../accounts/entities/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { StockService } from '../stock/stock.service';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { SalesService } from '../sales/sales.service';
import { Purchase } from '../purchases/entities/purchase.entity';
import { PurchaseItem } from '../purchases/entities/purchase-item.entity';
import { PurchasesService } from '../purchases/purchases.service';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';
import { PurchaseReturn } from '../returns/entities/purchase-return.entity';
import { PurchaseReturnItem } from '../returns/entities/purchase-return-item.entity';
import { ReturnsService } from '../returns/returns.service';
import { SyncQueueEntry } from '../outbox/entities/sync-queue.entity';
import { OutboxService } from '../outbox/outbox.service';
import { Sequence } from '../sequences/entities/sequence.entity';
import { SequenceService } from '../sequences/sequence.service';
import { JournalEntry } from '../journals/entities/journal-entry.entity';
import { JournalLine } from '../journals/entities/journal-line.entity';
import { JournalService } from '../journals/journal.service';
import { AccountingPeriod } from '../periods/entities/accounting-period.entity';
import { PeriodsService } from '../periods/periods.service';
import { ItemSerial } from '../item-serials/entities/item-serial.entity';
import { ItemSerialsService } from '../item-serials/item-serials.service';
import { Payment } from '../payments/entities/payment.entity';
import { RecostService } from './recost.service';

/**
 * The contract that makes editing safe: replaying an item's documents must
 * reproduce exactly what the forward paths produced. If that holds, cost is a
 * pure function of the surviving vouchers and any of them can be edited or
 * reversed with a recost afterwards.
 *
 * So the tests drive the REAL services to build history, then assert the replay
 * agrees with them — rather than asserting the replay against hand-computed
 * numbers, which would only prove the replay agrees with itself.
 */
describe('RecostService', () => {
  let recost: RecostService;
  let purchases: PurchasesService;
  let sales: SalesService;
  let returns: ReturnsService;
  let ds: DataSource;
  let itemId: string;

  const item = async () =>
    ds.getRepository(Item).findOneByOrFail({ id: itemId });
  const cost = async () => {
    const i = await item();
    return { avgCost: Number(i.avgCost), costedQty: Number(i.costedQty) };
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          inMemoryTypeOrm([
            Item, Brand, Category, Customer, Supplier, Store, Account,
            StockMovement, Sale, SaleItem, Purchase, PurchaseItem, SaleReturn,
            SaleReturnItem, PurchaseReturn, PurchaseReturnItem, SyncQueueEntry,
            Sequence, JournalEntry, JournalLine, AccountingPeriod, ItemSerial,
            Payment,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, Account, StockMovement, Sale, SaleItem, Purchase, PurchaseItem,
          SaleReturn, SaleReturnItem, PurchaseReturn, PurchaseReturnItem,
          SyncQueueEntry, Sequence, JournalEntry, JournalLine, AccountingPeriod,
          ItemSerial, Payment,
        ]),
      ],
      providers: [
        RecostService, PurchasesService, SalesService, ReturnsService,
        StockService, OutboxService, SequenceService, AccountsService,
        JournalService, PeriodsService, ItemSerialsService,
      ],
    }).compile();
    await module.init();

    recost = module.get(RecostService);
    purchases = module.get(PurchasesService);
    sales = module.get(SalesService);
    returns = module.get(ReturnsService);
    ds = module.get(DataSource);

    const saved = await ds.getRepository(Item).save(
      ds.getRepository(Item).create({
        name: 'AC', sku: 'AC-1', purchasePrice: 0, salePrice: 90000,
      }),
    );
    itemId = saved.id;
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('is a no-op on an item whose running cost is already correct', async () => {
    await purchases.create({ lines: [{ itemId, quantity: 10, unitPrice: 50000 }] });
    await purchases.create({ lines: [{ itemId, quantity: 5, unitPrice: 62000 }] });
    const forward = await cost();

    const r = await recost.recomputeItem(itemId);

    expect(r.after).toEqual(forward);
    expect(r.changed).toBe(false);
  });

  it('reproduces the weighted average the forward path computed', async () => {
    await purchases.create({ lines: [{ itemId, quantity: 10, unitPrice: 50000 }] });
    await purchases.create({ lines: [{ itemId, quantity: 5, unitPrice: 62000 }] });
    // (10×50000 + 5×62000) / 15 = 54000
    expect((await cost()).avgCost).toBe(54000);

    // Corrupt the stored values the way drift or a bad edit would.
    const i = await item();
    i.avgCost = 1; i.costedQty = 999;
    await ds.getRepository(Item).save(i);

    const r = await recost.recomputeItem(itemId);

    expect(r.after.avgCost).toBe(54000);
    expect(r.after.costedQty).toBe(15);
    expect(r.changed).toBe(true);
  });

  it('replays sales, sale returns and purchase returns into costedQty', async () => {
    await purchases.create({ lines: [{ itemId, quantity: 10, unitPrice: 50000 }] });
    await sales.create({ lines: [{ itemId, quantity: 4 }], paymentMethod: 'CASH' });
    await returns.createSaleReturn({ lines: [{ itemId, quantity: 1, unitPrice: 90000 }] });
    await returns.createPurchaseReturn({ lines: [{ itemId, quantity: 2, unitPrice: 50000 }] });
    const forward = await cost();

    const i = await item();
    i.costedQty = 0; i.avgCost = 0;
    await ds.getRepository(Item).save(i);

    const r = await recost.recomputeItem(itemId);

    // 10 − 4 (sale) + 1 (sale return) − 2 (purchase return) = 5
    expect(r.after.costedQty).toBe(5);
    expect(r.after).toEqual(forward);
  });

  it('excludes a reversed purchase, so the average reflects only what survives', async () => {
    await purchases.create({ lines: [{ itemId, quantity: 10, unitPrice: 50000 }] });
    const bad = await purchases.create({
      lines: [{ itemId, quantity: 10, unitPrice: 90000 }], // fat-fingered price
    });
    expect((await cost()).avgCost).toBe(70000); // average is now wrong

    await purchases.reverse(bad.id, { reason: 'price keyed wrong' });
    const r = await recost.recomputeItem(itemId);

    // Only the surviving bill counts — the pre-recost reversal could restore
    // costedQty but never avgCost, which is exactly the drift this fixes.
    expect(r.after.avgCost).toBe(50000);
    expect(r.after.costedQty).toBe(10);
  });

  it('excludes a reversed sale return from the replay', async () => {
    await purchases.create({ lines: [{ itemId, quantity: 10, unitPrice: 50000 }] });
    const ret = await returns.createSaleReturn({
      lines: [{ itemId, quantity: 3, unitPrice: 90000 }],
    });
    expect((await cost()).costedQty).toBe(13);

    await returns.reverseSaleReturn(ret.id, { reason: 'booked twice' });
    const r = await recost.recomputeItem(itemId);

    expect(r.after.costedQty).toBe(10);
  });

  it('ignores a CLAIMED_TO_COMPANY return, which never touched cost', async () => {
    await purchases.create({ lines: [{ itemId, quantity: 10, unitPrice: 50000 }] });
    await returns.createSaleReturn({
      disposition: 'CLAIMED_TO_COMPANY',
      lines: [{ itemId, quantity: 2, unitPrice: 90000 }],
    });

    const r = await recost.recomputeItem(itemId);

    expect(r.after.costedQty).toBe(10); // not 12
  });

  it('leaves COGS snapshots alone by default and rewrites them on request', async () => {
    await purchases.create({ lines: [{ itemId, quantity: 10, unitPrice: 50000 }] });
    const sale = await sales.create({
      lines: [{ itemId, quantity: 2 }], paymentMethod: 'CASH',
    });
    const lineId = sale.lines[0].id;
    const snapshot = async () =>
      Number(
        (await ds.getRepository(SaleItem).findOneByOrFail({ id: lineId }))
          .costAtSaleTime,
      );
    expect(await snapshot()).toBe(50000);

    // Correct the bill that set the cost basis, then recost without resnapshot.
    await ds.getRepository(PurchaseItem).update(
      { purchaseId: (await ds.getRepository(Purchase).find())[0].id },
      { unitPrice: 40000 },
    );
    const plain = await recost.recomputeItem(itemId);
    expect(plain.after.avgCost).toBe(40000);
    expect(plain.resnapshotted).toBe(0);
    expect(await snapshot()).toBe(50000); // history untouched

    const rewritten = await recost.recomputeItem(itemId, { resnapshotSales: true });
    expect(rewritten.resnapshotted).toBe(1);
    expect(await snapshot()).toBe(40000); // now reflects the corrected basis
  });

  it('is idempotent — recomputing twice changes nothing the second time', async () => {
    await purchases.create({ lines: [{ itemId, quantity: 7, unitPrice: 31000 }] });
    await sales.create({ lines: [{ itemId, quantity: 2 }], paymentMethod: 'CASH' });

    const first = await recost.recomputeItem(itemId);
    const second = await recost.recomputeItem(itemId);

    expect(second.after).toEqual(first.after);
    expect(second.changed).toBe(false);
  });

  it('zeroes an item whose only purchase was reversed', async () => {
    const p = await purchases.create({
      lines: [{ itemId, quantity: 4, unitPrice: 12000 }],
    });
    await purchases.reverse(p.id, { reason: 'wrong supplier' });

    const r = await recost.recomputeItem(itemId);

    expect(r.after).toEqual({ avgCost: 0, costedQty: 0 });
  });

  it('replays from the opening cost basis instead of erasing it', async () => {
    // Stock migrated in from previous software: no purchase document exists.
    const repo = ds.getRepository(Item);
    const i = await item();
    i.openingCostedQty = 4;
    i.openingAvgCost = 20000;
    i.costedQty = 4;
    i.avgCost = 20000;
    await repo.save(i);

    const opening = await recost.recomputeItem(itemId);
    expect(opening.after).toEqual({ avgCost: 20000, costedQty: 4 });

    // A later real purchase blends with the carried-in basis rather than
    // replacing it: (4×20000 + 2×26000) / 6 = 22000.
    await purchases.create({ lines: [{ itemId, quantity: 2, unitPrice: 26000 }] });
    const blended = await recost.recomputeItem(itemId);
    expect(blended.after).toEqual({ avgCost: 22000, costedQty: 6 });
  });

  it('recomputeAll reports how many items it corrected', async () => {
    await purchases.create({ lines: [{ itemId, quantity: 3, unitPrice: 1000 }] });
    const i = await item();
    i.avgCost = 7; // drift
    await ds.getRepository(Item).save(i);

    const summary = await recost.recomputeAll();

    expect(summary.items).toBe(1);
    expect(summary.changed).toBe(1);
    expect((await cost()).avgCost).toBe(1000);
  });
});
