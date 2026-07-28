import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { RecostService } from '../costing/recost.service';
import { Item } from '../items/entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Store } from '../stores/entities/store.entity';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { StockService } from '../stock/stock.service';
import { Account } from '../accounts/entities/account.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { PurchaseItem } from '../purchases/entities/purchase-item.entity';
import { SaleReturn } from './entities/sale-return.entity';
import { SaleReturnItem } from './entities/sale-return-item.entity';
import { PurchaseReturn } from './entities/purchase-return.entity';
import { PurchaseReturnItem } from './entities/purchase-return-item.entity';
import { Sequence } from '../sequences/entities/sequence.entity';
import { SequenceService } from '../sequences/sequence.service';
import { ItemSerial } from '../item-serials/entities/item-serial.entity';
import { ItemSerialsService } from '../item-serials/item-serials.service';
import { ReturnsService } from './returns.service';

/**
 * Focus: the reversal paths. A return moves stock and shifts what a party owes,
 * so "undo" has to walk back the physical side and stop counting toward every
 * derived figure — otherwise reversing looks like it worked while balances stay
 * wrong. Reports-side exclusion is asserted in reports.service.spec.ts; here we
 * assert the row state, stock, costedQty and serial transitions.
 */
describe('ReturnsService — reversal', () => {
  let service: ReturnsService;
  let stock: StockService;
  let serials: ItemSerialsService;
  let ds: DataSource;
  let itemId: string;
  let storeId: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          inMemoryTypeOrm([
            Item, Brand, Category, Customer, Supplier, Store, StockMovement,
            Account, Sale, SaleItem, Purchase, PurchaseItem, SaleReturn,
            SaleReturnItem, PurchaseReturn, PurchaseReturnItem, Sequence,
            ItemSerial,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, StockMovement, Sale, SaleItem, SaleReturn, SaleReturnItem,
          PurchaseReturn, PurchaseReturnItem, Sequence, ItemSerial,
        ]),
      ],
      providers: [
        ReturnsService, StockService, SequenceService, ItemSerialsService, RecostService,
      ],
    }).compile();
    await module.init();

    service = module.get(ReturnsService);
    stock = module.get(StockService);
    serials = module.get(ItemSerialsService);
    ds = module.get(DataSource);

    const store = await ds
      .getRepository(Store)
      .save(ds.getRepository(Store).create({ name: 'Main' }));
    storeId = store.id;

    // Opening stock, i.e. 10 units carried in at cost 1000 with no purchase
    // document behind them. It goes in the opening fields, not straight into
    // avgCost/costedQty, because reversal recosts and a recost replays from the
    // opening basis — see Item.openingAvgCost.
    const item = await ds.getRepository(Item).save(
      ds.getRepository(Item).create({
        name: 'Fan', sku: 'FAN-1', purchasePrice: 1000, salePrice: 1500,
        openingCostedQty: 10, openingAvgCost: 1000,
        costedQty: 10, avgCost: 1000,
      }),
    );
    itemId = item.id;

    // Seed on-hand so an OUT (purchase return, or a sale-return reversal) has
    // stock to draw from.
    await stock.recordMovement({
      itemId, storeId, type: 'IN', quantity: 10,
      referenceType: 'OPENING', referenceId: item.id,
    });
  });

  afterEach(async () => {
    await ds.destroy();
  });

  const costedQty = async () =>
    Number((await ds.getRepository(Item).findOneByOrFail({ id: itemId })).costedQty);

  // ── sale returns ──────────────────────────────────────────────────────────

  it('reversing a RESTOCK sale return re-issues the stock and drops costedQty', async () => {
    const r = await service.createSaleReturn({
      storeId,
      lines: [{ itemId, quantity: 3, unitPrice: 1500 }],
    });
    expect(await stock.getOnHand(itemId)).toBe(13); // returned goods came in
    expect(await costedQty()).toBe(13);

    const reversed = await service.reverseSaleReturn(r.id, { reason: 'keyed twice' });

    expect(reversed.reversedAt).toBeTruthy();
    expect(reversed.reversalReason).toBe('keyed twice');
    expect(await stock.getOnHand(itemId)).toBe(10); // back where we started
    expect(await costedQty()).toBe(10);
  });

  it('reversing a CLAIMED_TO_COMPANY sale return touches no stock', async () => {
    const r = await service.createSaleReturn({
      storeId,
      disposition: 'CLAIMED_TO_COMPANY',
      lines: [{ itemId, quantity: 2, unitPrice: 1500 }],
    });
    expect(await stock.getOnHand(itemId)).toBe(10); // claim never restocked
    expect(await costedQty()).toBe(10);

    await service.reverseSaleReturn(r.id, { reason: 'wrong customer' });

    // Nothing was booked forward, so nothing unwinds — and critically it must
    // not book a spurious OUT.
    expect(await stock.getOnHand(itemId)).toBe(10);
    expect(await costedQty()).toBe(10);
  });

  it('is idempotent — reversing twice does not double-unwind stock', async () => {
    const r = await service.createSaleReturn({
      storeId,
      lines: [{ itemId, quantity: 4, unitPrice: 1500 }],
    });
    const first = await service.reverseSaleReturn(r.id, { reason: 'mistake' });
    const second = await service.reverseSaleReturn(r.id, { reason: 'again' });

    expect(second.reversedAt).toEqual(first.reversedAt);
    expect(second.reversalReason).toBe('mistake'); // original reason preserved
    expect(await stock.getOnHand(itemId)).toBe(10);
  });

  it('requires a reason', async () => {
    const r = await service.createSaleReturn({
      storeId,
      lines: [{ itemId, quantity: 1, unitPrice: 1500 }],
    });
    await expect(
      service.reverseSaleReturn(r.id, { reason: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // and the row is untouched
    expect((await service.findSaleReturn(r.id)).reversedAt).toBeFalsy();
  });

  it('records the returned serials on the line and walks them back to SOLD', async () => {
    await serials.registerStock({ itemId, serials: ['SN-1'] });
    const repo = ds.getRepository(ItemSerial);
    const row = await repo.findOneByOrFail({ serial: 'SN-1' });
    row.status = 'SOLD';
    await repo.save(row);

    const r = await service.createSaleReturn({
      storeId,
      lines: [{ itemId, quantity: 1, unitPrice: 1500, serials: ['SN-1'] }],
    });
    expect(r.lines[0].serials).toEqual(['SN-1']);
    expect((await repo.findOneByOrFail({ serial: 'SN-1' })).status).toBe('RETURNED');

    await service.reverseSaleReturn(r.id, { reason: 'not actually returned' });

    expect((await repo.findOneByOrFail({ serial: 'SN-1' })).status).toBe('SOLD');
  });

  it('restores a written-off serial when a company claim is reversed', async () => {
    await serials.registerStock({ itemId, serials: ['SN-2'] });
    const repo = ds.getRepository(ItemSerial);
    const row = await repo.findOneByOrFail({ serial: 'SN-2' });
    row.status = 'SOLD';
    await repo.save(row);

    const r = await service.createSaleReturn({
      storeId,
      disposition: 'CLAIMED_TO_COMPANY',
      lines: [{ itemId, quantity: 1, unitPrice: 1500, serials: ['SN-2'] }],
    });
    expect((await repo.findOneByOrFail({ serial: 'SN-2' })).status).toBe('WRITE_OFF');

    await service.reverseSaleReturn(r.id, { reason: 'claim withdrawn' });

    expect((await repo.findOneByOrFail({ serial: 'SN-2' })).status).toBe('SOLD');
  });

  it('refuses to reverse an exchange give-back while the replacement sale stands', async () => {
    const sale = await ds.getRepository(Sale).save(
      ds.getRepository(Sale).create({
        invoiceNo: 'INV-000042', totalAmount: 1500, netAmount: 1500,
        paidAmount: 1500, dueAmount: 0, paymentMethod: 'CASH',
      }),
    );
    const r = await service.createSaleReturn({
      storeId,
      replacementSaleId: sale.id,
      lines: [{ itemId, quantity: 1, unitPrice: 1500 }],
    });

    await expect(
      service.reverseSaleReturn(r.id, { reason: 'undo swap' }),
    ).rejects.toThrow(/INV-000042/);

    // Once the replacement is reversed, the give-back can be unwound.
    const saleRepo = ds.getRepository(Sale);
    sale.reversedAt = new Date();
    await saleRepo.save(sale);

    const reversed = await service.reverseSaleReturn(r.id, { reason: 'undo swap' });
    expect(reversed.reversedAt).toBeTruthy();
  });

  it('refuses the reversal when the returned unit has already been re-sold', async () => {
    const r = await service.createSaleReturn({
      storeId,
      lines: [{ itemId, quantity: 2, unitPrice: 1500 }],
    });
    // Everything on the shelf walks out the door again.
    await stock.recordMovement({
      itemId, storeId, type: 'OUT', quantity: 12,
      referenceType: 'SALE', referenceId: r.id,
    });

    await expect(
      service.reverseSaleReturn(r.id, { reason: 'oops' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Transaction rolled back — the row is still live, not half-reversed.
    expect((await service.findSaleReturn(r.id)).reversedAt).toBeFalsy();
  });

  // ── purchase returns ──────────────────────────────────────────────────────

  it('reversing a STOCK purchase return brings the goods back and restores costedQty', async () => {
    const r = await service.createPurchaseReturn({
      storeId,
      lines: [{ itemId, quantity: 4, unitPrice: 1000 }],
    });
    expect(await stock.getOnHand(itemId)).toBe(6); // goods went to the supplier
    expect(await costedQty()).toBe(6);

    const reversed = await service.reversePurchaseReturn(r.id, {
      reason: 'supplier refused the return',
    });

    expect(reversed.reversedAt).toBeTruthy();
    expect(await stock.getOnHand(itemId)).toBe(10);
    expect(await costedQty()).toBe(10);
  });

  it('reversing a WARRANTY_CREDIT purchase return touches no stock', async () => {
    const r = await service.createPurchaseReturn({
      storeId,
      disposition: 'WARRANTY_CREDIT',
      lines: [{ itemId, quantity: 3, unitPrice: 1000 }],
    });
    expect(await stock.getOnHand(itemId)).toBe(10);

    await service.reversePurchaseReturn(r.id, { reason: 'credit note cancelled' });

    expect(await stock.getOnHand(itemId)).toBe(10);
    expect(await costedQty()).toBe(10);
  });

  it('purchase-return reversal is idempotent', async () => {
    const r = await service.createPurchaseReturn({
      storeId,
      lines: [{ itemId, quantity: 2, unitPrice: 1000 }],
    });
    await service.reversePurchaseReturn(r.id, { reason: 'first' });
    await service.reversePurchaseReturn(r.id, { reason: 'second' });

    expect(await stock.getOnHand(itemId)).toBe(10); // not 12
    expect((await service.findPurchaseReturn(r.id)).reversalReason).toBe('first');
  });
});
