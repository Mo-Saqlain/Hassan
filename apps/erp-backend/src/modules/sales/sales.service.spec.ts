import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { RecostService } from '../costing/recost.service';
import { Purchase } from '../purchases/entities/purchase.entity';
import { PurchaseItem } from '../purchases/entities/purchase-item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';
import { PurchaseReturn } from '../returns/entities/purchase-return.entity';
import { PurchaseReturnItem } from '../returns/entities/purchase-return-item.entity';
import { Item } from '../items/entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Store } from '../stores/entities/store.entity';
import { Account } from '../accounts/entities/account.entity';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SyncQueueEntry } from '../outbox/entities/sync-queue.entity';
import { StockService } from '../stock/stock.service';
import { OutboxService } from '../outbox/outbox.service';
import { SalesService } from './sales.service';
import { Sequence } from '../sequences/entities/sequence.entity';
import { SequenceService } from '../sequences/sequence.service';
import { Payment } from '../payments/entities/payment.entity';
import { JournalEntry } from '../journals/entities/journal-entry.entity';
import { JournalLine } from '../journals/entities/journal-line.entity';
import { JournalService } from '../journals/journal.service';
import { AccountingPeriod } from '../periods/entities/accounting-period.entity';
import { PeriodsService } from '../periods/periods.service';
import { AccountsService } from '../accounts/accounts.service';
import { ItemSerial } from '../item-serials/entities/item-serial.entity';
import { ItemSerialsService } from '../item-serials/item-serials.service';
// Read by the edit guards: a sale with a delivery or a service ticket attached
// can't have its lines replaced from under them.
import { Delivery } from '../deliveries/entities/delivery.entity';
import { ServiceTicket } from '../service-tickets/entities/service-ticket.entity';

describe('SalesService', () => {
  let service: SalesService;
  let stock: StockService;
  let ds: DataSource;
  let itemId: string;
  let testModule: any;

  beforeEach(async () => {
    testModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          inMemoryTypeOrm([
            Item, Brand, Category, Customer, Supplier, Store, Account,
            StockMovement, Sale, SaleItem, SyncQueueEntry, Sequence, Payment,
            JournalEntry, JournalLine, AccountingPeriod, ItemSerial,
            Purchase, PurchaseItem, SaleReturn, SaleReturnItem, PurchaseReturn, PurchaseReturnItem,
            Delivery, ServiceTicket,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, StockMovement, Sale, SaleItem, SyncQueueEntry, Sequence,
          Account, JournalEntry, JournalLine, AccountingPeriod, ItemSerial,
        ]),
      ],
      providers: [
        SalesService, StockService, OutboxService, SequenceService,
        AccountsService, JournalService, PeriodsService, ItemSerialsService, RecostService,
      ],
    }).compile();
    // .init() triggers onModuleInit lifecycle hooks. AccountsService.onModuleInit
    // seeds the system accounts (REVENUE / COGS / INVENTORY / A_R / A_P /
    // CASH_ON_HAND) that the journal posting relies on — without this call
    // the seeder never runs in tests.
    await testModule.init();

    service = testModule.get(SalesService);
    stock = testModule.get(StockService);
    ds = testModule.get(DataSource);

    // The seeded "Phone" item is the generic stand-in for every non-serial
    // test in this file. Explicitly disable serial tracking — the Item
    // entity defaults both tracksSerials + serialRequiredOnSale to true,
    // which would force every voucher / sale test to supply serials.
    const item = await ds.getRepository(Item).save(
      ds.getRepository(Item).create({
        name: 'Phone', sku: 'PHN-1',
        purchasePrice: 300, salePrice: 500,
        tracksSerials: false,
        serialRequiredOnSale: false,
      }),
    );
    itemId = item.id;

    await stock.recordMovement({
      itemId, type: 'IN', quantity: 10,
      referenceType: 'PURCHASE', referenceId: 'seed',
    });
  });

  afterEach(async () => {
    delete process.env.CLOUD_SYNC_URL;
    await ds.destroy();
  });

  it('creates a sale, decrements stock atomically', async () => {
    const sale = await service.create({
      lines: [{ itemId, quantity: 3, unitPrice: 500 }],
    });
    expect(sale.invoiceNo).toMatch(/^INV-/);
    expect(Number(sale.totalAmount)).toBe(1500);
    expect(Number(sale.netAmount)).toBe(1500);
    expect(Number(sale.paidAmount)).toBe(1500); // default
    expect(Number(sale.dueAmount)).toBe(0);
    expect(await stock.getOnHand(itemId)).toBe(7);
  });

  it('auto-generates sequential invoice numbers', async () => {
    const s1 = await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 500 }] });
    const s2 = await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 500 }] });
    expect(s1.invoiceNo).toBe('INV-000001');
    expect(s2.invoiceNo).toBe('INV-000002');
  });

  it('honours partial payment, leaves dueAmount positive', async () => {
    const sale = await service.create({
      lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      paidAmount: 400,
    });
    expect(Number(sale.netAmount)).toBe(1000);
    expect(Number(sale.paidAmount)).toBe(400);
    expect(Number(sale.dueAmount)).toBe(600);
  });

  it('applies discount to net amount', async () => {
    const sale = await service.create({
      lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      discount: 100,
      paidAmount: 0,
    });
    expect(Number(sale.totalAmount)).toBe(1000);
    expect(Number(sale.discount)).toBe(100);
    expect(Number(sale.netAmount)).toBe(900);
    expect(Number(sale.dueAmount)).toBe(900);
  });

  it('rolls back entire transaction when stock insufficient', async () => {
    const before = await stock.getOnHand(itemId);
    await expect(
      service.create({ lines: [{ itemId, quantity: 999, unitPrice: 500 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Neither sale row nor stock movement should have been written.
    expect(await stock.getOnHand(itemId)).toBe(before);
    expect(await ds.getRepository(Sale).count()).toBe(0);
  });

  it('rejects unknown item id', async () => {
    await expect(
      service.create({
        lines: [{
          itemId: '00000000-0000-0000-0000-000000000000',
          quantity: 1, unitPrice: 100,
        }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does NOT enqueue outbox event when CLOUD_SYNC_URL is unset', async () => {
    await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 500 }] });
    expect(await ds.getRepository(SyncQueueEntry).count()).toBe(0);
  });

  it('enqueues SALE_CREATED outbox event when CLOUD_SYNC_URL is set', async () => {
    process.env.CLOUD_SYNC_URL = 'http://cloud/api/sync/push';
    await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 500 }] });
    const entries = await ds.getRepository(SyncQueueEntry).find();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('SALE_CREATED');
    expect(entries[0].status).toBe('PENDING');
  });

  it('skipOutbox flag suppresses enqueue even with CLOUD_SYNC_URL set', async () => {
    process.env.CLOUD_SYNC_URL = 'http://cloud/api/sync/push';
    await service.create(
      { lines: [{ itemId, quantity: 1, unitPrice: 500 }] },
      { skipOutbox: true },
    );
    expect(await ds.getRepository(SyncQueueEntry).count()).toBe(0);
  });

  describe('credit-limit gating', () => {
    let customerId: string;

    beforeEach(async () => {
      const c = await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({
          name: 'Walk-in Cust',
          openingBalance: 0,
          creditLimit: 1000,
          creditEnabled: false,
        }),
      );
      customerId = c.id;
    });

    it('rejects a CREDIT sale when creditEnabled is false', async () => {
      await expect(
        service.create({
          customerId,
          paymentMethod: 'CREDIT',
          paidAmount: 0,
          lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      // sale should not have been persisted, stock unchanged
      expect(await ds.getRepository(Sale).count()).toBe(0);
    });

    it('rejects a partial-pay sale that would exceed the credit limit', async () => {
      // enable credit, raise limit small
      await ds.getRepository(Customer).update(customerId, {
        creditEnabled: true,
        creditLimit: 200,
      });
      // sale netAmount 500, paid 100 → dueAmount 400 > 200 limit
      await expect(
        service.create({
          customerId,
          paymentMethod: 'CASH',
          paidAmount: 100,
          lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a partial-pay sale within the credit limit', async () => {
      await ds.getRepository(Customer).update(customerId, {
        creditEnabled: true,
        creditLimit: 2000,
      });
      const sale = await service.create({
        customerId,
        paymentMethod: 'CASH',
        paidAmount: 100,
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      expect(Number(sale.dueAmount)).toBe(400);
    });

    it('skips the gate when there is no customer (walk-in cash sale)', async () => {
      const sale = await service.create({
        paymentMethod: 'CASH',
        paidAmount: 0,
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      expect(Number(sale.dueAmount)).toBe(500);
    });

    it('counts existing unpaid sales when computing outstanding', async () => {
      await ds.getRepository(Customer).update(customerId, {
        creditEnabled: true,
        creditLimit: 1000,
      });
      // first sale: dueAmount 400 → outstanding 400
      await service.create({
        customerId,
        paymentMethod: 'CASH',
        paidAmount: 100,
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      // second sale would push outstanding to 400 + 700 = 1100 > 1000
      await expect(
        service.create({
          customerId,
          paymentMethod: 'CASH',
          paidAmount: 100,
          lines: [{ itemId, quantity: 1, unitPrice: 800 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('journal posting', () => {
    it('posts a balanced 4-line entry for a fully-paid cash sale', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      });
      const entry = await ds.getRepository(JournalEntry).findOne({
        where: { sourceModule: 'SALE', sourceRef: sale.invoiceNo },
        relations: ['lines'],
      });
      expect(entry).toBeDefined();
      const totalDr = entry!.lines.reduce((s, l) => s + Number(l.debit), 0);
      const totalCr = entry!.lines.reduce((s, l) => s + Number(l.credit), 0);
      // Revenue Cr 1000, Cash Dr 1000, COGS Dr 600, Inventory Cr 600
      expect(totalDr).toBe(1600);
      expect(totalCr).toBe(1600);
    });

    it('posts an A/R debit when the sale leaves a due amount', async () => {
      const customer = await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({
          name: 'Credit Cust',
          creditEnabled: true,
          creditLimit: 100000,
        }),
      );
      const sale = await service.create({
        customerId: customer.id,
        paymentMethod: 'CREDIT',
        paidAmount: 0,
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      const entry = await ds.getRepository(JournalEntry).findOne({
        where: { sourceModule: 'SALE', sourceRef: sale.invoiceNo },
        relations: ['lines'],
      });
      const arDebit = entry!.lines.find((l) => Number(l.debit) === 500 && Number(l.credit) === 0);
      expect(arDebit).toBeDefined();
    });
  });

  describe('reversal', () => {
    it('rejects a reversal with empty reason', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      await expect(service.reverse(sale.id, { reason: '' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('marks the sale reversed, books a stock IN, and posts a balancing journal entry', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      });
      const onHandBefore = await stock.getOnHand(itemId);
      const reversed = await service.reverse(sale.id, { reason: 'wrong item' });
      expect(reversed.reversedAt).toBeDefined();
      expect(reversed.reversalReason).toBe('wrong item');
      // Stock back up by 2
      expect(await stock.getOnHand(itemId)).toBe(onHandBefore + 2);
      // Reversal journal entry exists and is linked
      const original = await ds.getRepository(JournalEntry).findOne({
        where: { sourceModule: 'SALE', sourceRef: sale.invoiceNo },
      });
      const reversal = await ds.getRepository(JournalEntry).findOne({
        where: { reversesJournalEntryId: original!.id },
        relations: ['lines'],
      });
      expect(reversal).toBeDefined();
      // Reversal totals match original — net zero across the pair
      const revDr = reversal!.lines.reduce((s, l) => s + Number(l.debit), 0);
      const revCr = reversal!.lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(revDr).toBe(revCr); // balanced
    });

    it('is idempotent — second reverse is a no-op', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      await service.reverse(sale.id, { reason: 'first' });
      const onHand = await stock.getOnHand(itemId);
      await service.reverse(sale.id, { reason: 'second' });
      // Stock should NOT increase a second time
      expect(await stock.getOnHand(itemId)).toBe(onHand);
    });
  });

  describe('booking-hold allocation state', () => {
    let customerId: string;
    let trackedItemId: string;
    let serialsSvc: ItemSerialsService;

    beforeEach(async () => {
      serialsSvc = testModule.get(ItemSerialsService);
      const c = await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({
          name: 'Booking-Customer', creditEnabled: true, creditLimit: 100000,
        }),
      );
      customerId = c.id;
      const tracked = await ds.getRepository(Item).save(
        ds.getRepository(Item).create({
          name: 'AC Inverter', sku: 'AC-1',
          purchasePrice: 80000, salePrice: 100000,
          tracksSerials: true, serialRequiredOnSale: true,
          hasWarranty: true, warrantyType: 'COMPANY', warrantyDays: 365,
        }),
      );
      trackedItemId = tracked.id;
      await stock.recordMovement({
        itemId: trackedItemId, type: 'IN', quantity: 2,
        referenceType: 'PURCHASE', referenceId: 'seed-tracked',
      });
    });

    it('full-payment sale path flips serial to DELIVERED via bindToSale', async () => {
      const sale = await service.create({
        customerId,
        lines: [{ itemId: trackedItemId, quantity: 1, unitPrice: 100000 }],
        paidAmount: 100000,
      });
      expect(Number(sale.dueAmount)).toBe(0);

      await serialsSvc.bindToSale({
        serial: 'SN-FULL-1',
        itemId: trackedItemId,
        saleInvoiceNo: sale.invoiceNo,
        soldAt: sale.createdAt,
      });
      const row = await ds
        .getRepository(ItemSerial)
        .findOne({ where: { serial: 'SN-FULL-1' } });
      expect(row?.allocationStatus).toBe('DELIVERED');
      expect(row?.status).toBe('SOLD');
    });

    it('partial-payment sale path flips serial to BOOKED via reserveForBooking', async () => {
      const sale = await service.create({
        customerId,
        lines: [{ itemId: trackedItemId, quantity: 1, unitPrice: 100000 }],
        paidAmount: 40000,
        expectedPaymentDate: '2030-01-01',
      });
      expect(Number(sale.dueAmount)).toBe(60000);

      await serialsSvc.reserveForBooking({
        serials: ['SN-BOOK-1'],
        itemId: trackedItemId,
        saleInvoiceNo: sale.invoiceNo,
        soldToCustomerId: customerId,
        bookedAt: sale.createdAt,
      });
      const row = await ds
        .getRepository(ItemSerial)
        .findOne({ where: { serial: 'SN-BOOK-1' } });
      expect(row?.allocationStatus).toBe('BOOKED');
      expect(row?.status).toBe('IN_STOCK');
      expect(row?.bookedAt).toBeTruthy();
      expect(row?.saleInvoiceNo).toBe(sale.invoiceNo);
    });
  });

  describe('createFromVoucher (Sales Voucher)', () => {
    let cashAccountId: string;
    let bankAccountId: string;

    beforeEach(async () => {
      const cashAcct = await ds.getRepository(Account).save(
        ds.getRepository(Account).create({
          name: 'Till — Counter 1',
          type: 'CASH',
          code: '1111',
          isActive: true,
        }),
      );
      const bankAcct = await ds.getRepository(Account).save(
        ds.getRepository(Account).create({
          name: 'HBL Current',
          type: 'BANK',
          code: '1121',
          isActive: true,
        }),
      );
      cashAccountId = cashAcct.id;
      bankAccountId = bankAcct.id;
    });

    it('2-split clean (Cash + Bank exactly clears net): zero residual, one Sale, two Receipts', async () => {
      const { sale, receipts } = await service.createFromVoucher({
        lines: [{ itemId, quantity: 2, unitPrice: 500 }],
        splits: [
          { accountId: cashAccountId, amount: 600 },
          { accountId: bankAccountId, amount: 400 },
        ],
      });
      expect(Number(sale.netAmount)).toBe(1000);
      expect(Number(sale.paidAmount)).toBe(1000);
      expect(Number(sale.dueAmount)).toBe(0);
      expect(receipts).toHaveLength(2);
      expect(receipts.every((r) => r.direction === 'IN')).toBe(true);
      const splitSum =
        Number(receipts[0].amount) + Number(receipts[1].amount);
      expect(splitSum).toBe(1000);
      // Both Payment rows are persisted and tagged as splits of this sale.
      const persistedPayments = await ds
        .getRepository(Payment)
        .find({ where: { referenceType: 'SALE_SPLIT', referenceId: sale.id } });
      expect(persistedPayments).toHaveLength(2);
      // Voucher numbers follow the RCT sequence.
      expect(persistedPayments.every((p) => p.voucherNo.startsWith('RCT-')))
        .toBe(true);
    });

    it('3-split with residual: dueAmount equals the gap, customer A/R picks up the rest', async () => {
      const customer = await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({
          name: 'Voucher Cust',
          creditEnabled: true,
          creditLimit: 100000,
        }),
      );
      const { sale, receipts } = await service.createFromVoucher({
        customerId: customer.id,
        lines: [{ itemId, quantity: 1, unitPrice: 1300 }],
        splits: [
          { accountId: cashAccountId, amount: 200 },
          { accountId: bankAccountId, amount: 800 },
          { accountId: cashAccountId, amount: 200 },
        ],
      });
      expect(Number(sale.netAmount)).toBe(1300);
      expect(Number(sale.paidAmount)).toBe(1200);
      expect(Number(sale.dueAmount)).toBe(100);
      expect(receipts).toHaveLength(3);
      // The residual still rides as A/R on the customer ledger, not as a
      // hidden fourth payment row.
      const allPayments = await ds
        .getRepository(Payment)
        .find({ where: { referenceId: sale.id } });
      expect(allPayments).toHaveLength(3);
    });

    it('oversplit (splits > net) is rejected before any write: no Sale, no Payment', async () => {
      await expect(
        service.createFromVoucher({
          lines: [{ itemId, quantity: 1, unitPrice: 500 }],
          splits: [
            { accountId: cashAccountId, amount: 400 },
            { accountId: bankAccountId, amount: 200 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await ds.getRepository(Sale).count()).toBe(0);
      expect(await ds.getRepository(Payment).count()).toBe(0);
    });

    describe('customer-credit split', () => {
      let customerId: string;

      beforeEach(async () => {
        // Customer paid Rs 5,000 advance previously (sits as on-account
        // credit on the customer ledger: prior Receipt of 5,000, no sale
        // to allocate against → A/R = -5,000).
        const c = await ds.getRepository(Customer).save(
          ds.getRepository(Customer).create({
            name: 'Credit Customer',
            creditEnabled: true,
            creditLimit: 100000,
          }),
        );
        customerId = c.id;
        const paymentRepo = ds.getRepository(Payment);
        const seq = await testModule
          .get(SequenceService)
          .next('RCT', () => paymentRepo.count());
        await paymentRepo.save(
          paymentRepo.create({
            voucherNo: seq,
            direction: 'IN' as const,
            accountId: cashAccountId,
            customerId,
            amount: 5000,
            referenceType: 'ADVANCE',
            notes: 'Customer paid Rs 5,000 advance',
          }),
        );
      });

      it('applies existing customer credit toward the bill — no extra Payment row created', async () => {
        const { sale, receipts } = await service.createFromVoucher({
          customerId,
          lines: [{ itemId, quantity: 1, unitPrice: 8000 }],
          splits: [
            { accountId: cashAccountId, amount: 3000 },
            { kind: 'CUSTOMER_CREDIT', amount: 5000 },
          ],
        });
        expect(Number(sale.netAmount)).toBe(8000);
        expect(Number(sale.paidAmount)).toBe(8000);
        expect(Number(sale.dueAmount)).toBe(0);
        // Only the cash split gets a Receipt row — the credit split is a
        // ledger-side application, no second receipt is written.
        expect(receipts).toHaveLength(1);
        expect(Number(receipts[0].amount)).toBe(3000);
        // Total Payment rows for this customer = the original advance (1)
        // + the cash split for this voucher (1) = 2. No phantom credit row.
        const allPayments = await ds
          .getRepository(Payment)
          .find({ where: { customerId } });
        expect(allPayments).toHaveLength(2);
      });

      it('rejects credit splits that exceed the customer\'s available credit', async () => {
        await expect(
          service.createFromVoucher({
            customerId,
            lines: [{ itemId, quantity: 1, unitPrice: 8000 }],
            splits: [
              // Customer holds 5000 credit; trying to apply 7000 should fail.
              { kind: 'CUSTOMER_CREDIT', amount: 7000 },
              { accountId: cashAccountId, amount: 1000 },
            ],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('rejects credit splits when no customer is on the voucher', async () => {
        await expect(
          service.createFromVoucher({
            lines: [{ itemId, quantity: 1, unitPrice: 500 }],
            splits: [{ kind: 'CUSTOMER_CREDIT', amount: 500 }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('tracked serials', () => {
      let trackedItemId: string;
      let customerId: string;

      beforeEach(async () => {
        const tracked = await ds.getRepository(Item).save(
          ds.getRepository(Item).create({
            name: 'Refrigerator',
            sku: 'RF-1',
            purchasePrice: 60000,
            salePrice: 80000,
            tracksSerials: true,
            serialRequiredOnSale: true,
            hasWarranty: true,
            warrantyType: 'COMPANY',
            warrantyDays: 365,
          }),
        );
        trackedItemId = tracked.id;
        await stock.recordMovement({
          itemId: trackedItemId,
          type: 'IN',
          quantity: 3,
          referenceType: 'PURCHASE',
          referenceId: 'seed-tracked-voucher',
        });
        const c = await ds.getRepository(Customer).save(
          ds.getRepository(Customer).create({
            name: 'Voucher Tracked Cust',
            creditEnabled: true,
            creditLimit: 1000000,
          }),
        );
        customerId = c.id;
      });

      it('full-payment voucher binds serial to DELIVERED with warranty stamp', async () => {
        const { sale } = await service.createFromVoucher({
          customerId,
          lines: [
            {
              itemId: trackedItemId,
              quantity: 1,
              unitPrice: 80000,
              serials: ['SN-VCHR-FULL-1'],
            },
          ],
          splits: [{ accountId: cashAccountId, amount: 80000 }],
        });
        expect(Number(sale.dueAmount)).toBe(0);

        const row = await ds
          .getRepository(ItemSerial)
          .findOne({ where: { serial: 'SN-VCHR-FULL-1' } });
        expect(row?.status).toBe('SOLD');
        expect(row?.allocationStatus).toBe('DELIVERED');
        expect(row?.saleInvoiceNo).toBe(sale.invoiceNo);
        // Warranty pulled from the Item template (365 days).
        expect(row?.warrantyDays).toBe(365);
        expect(row?.warrantyEndAt).toBeTruthy();
      });

      it('partial-payment voucher flips serial to BOOKED (physical IN_STOCK)', async () => {
        const { sale } = await service.createFromVoucher({
          customerId,
          lines: [
            {
              itemId: trackedItemId,
              quantity: 1,
              unitPrice: 80000,
              serials: ['SN-VCHR-BOOK-1'],
            },
          ],
          splits: [{ accountId: cashAccountId, amount: 30000 }],
        });
        expect(Number(sale.dueAmount)).toBe(50000);

        const row = await ds
          .getRepository(ItemSerial)
          .findOne({ where: { serial: 'SN-VCHR-BOOK-1' } });
        expect(row?.allocationStatus).toBe('BOOKED');
        expect(row?.status).toBe('IN_STOCK');
        expect(row?.saleInvoiceNo).toBe(sale.invoiceNo);
        expect(row?.bookedAt).toBeTruthy();
        // Warranty should NOT be stamped yet — only stamps on bindToSale.
        expect(row?.warrantyEndAt).toBeFalsy();
      });

      it('serial-count mismatch rejected before any DB write', async () => {
        await expect(
          service.createFromVoucher({
            customerId,
            lines: [
              {
                itemId: trackedItemId,
                quantity: 2,
                unitPrice: 80000,
                serials: ['SN-ONLY-ONE'], // 1 serial but qty 2
              },
            ],
            splits: [{ accountId: cashAccountId, amount: 160000 }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        // Sale + Payment counts unchanged
        expect(await ds.getRepository(Sale).count()).toBe(0);
        expect(await ds.getRepository(Payment).count()).toBe(0);
        expect(
          await ds
            .getRepository(ItemSerial)
            .findOne({ where: { serial: 'SN-ONLY-ONE' } }),
        ).toBeNull();
      });
    });
  });

  describe('model-only warranty snapshot + lookup', () => {
    // An item sold by model only (no serial) that still carries 1-year cover.
    let warrantyItemId: string;

    beforeEach(async () => {
      const item = await ds.getRepository(Item).save(
        ds.getRepository(Item).create({
          name: 'Ceiling Fan',
          sku: 'FAN-1',
          purchasePrice: 1000,
          salePrice: 2000,
          tracksSerials: false,
          serialRequiredOnSale: false,
          hasWarranty: true,
          warrantyType: 'COMPANY',
          warrantyDays: 365,
        }),
      );
      warrantyItemId = item.id;
      await stock.recordMovement({
        itemId: warrantyItemId,
        type: 'IN',
        quantity: 5,
        referenceType: 'PURCHASE',
        referenceId: 'seed',
      });
    });

    it('freezes a line-level warranty window at sale time', async () => {
      const sale = await service.create({
        lines: [{ itemId: warrantyItemId, quantity: 1, unitPrice: 2000 }],
      });
      const line = await ds
        .getRepository(SaleItem)
        .findOne({ where: { saleId: sale.id } });
      expect(line?.warrantyType).toBe('COMPANY');
      expect(line?.warrantyDays).toBe(365);
      expect(line?.warrantyStartAt).toBeTruthy();
      expect(line?.warrantyEndAt).toBeTruthy();
      const days =
        (new Date(line!.warrantyEndAt!).getTime() -
          new Date(line!.warrantyStartAt!).getTime()) /
        86400000;
      expect(Math.round(days)).toBe(365);
    });

    it('does NOT stamp a window when the item has no real cover', async () => {
      // The default "Phone" item (itemId) has no warrantyDays → no window.
      const sale = await service.create({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      const line = await ds
        .getRepository(SaleItem)
        .findOne({ where: { saleId: sale.id } });
      expect(line?.warrantyEndAt).toBeFalsy();
      expect(line?.warrantyType).toBeFalsy();
    });

    it('lookupByInvoice surfaces an active warranty line', async () => {
      const sale = await service.create({
        lines: [{ itemId: warrantyItemId, quantity: 2, unitPrice: 2000 }],
      });
      const res = await service.warrantyByInvoice(sale.invoiceNo);
      expect(res).not.toBeNull();
      expect(res!.lines).toHaveLength(1);
      expect(res!.lines[0].active).toBe(true);
      expect(res!.lines[0].warrantyType).toBe('COMPANY');
      expect(res!.lines[0].quantity).toBe(2);
    });

    it('warrantyByModel filters to the requested item only', async () => {
      const sale = await service.create({
        lines: [
          { itemId: warrantyItemId, quantity: 1, unitPrice: 2000 },
          { itemId, quantity: 1, unitPrice: 500 },
        ],
      });
      const rows = await service.warrantyByModel(warrantyItemId);
      expect(rows).toHaveLength(1);
      expect(rows[0].itemId).toBe(warrantyItemId);
      expect(rows[0].invoiceNo).toBe(sale.invoiceNo);
    });
  });

  // ─── searchable, paged history ────────────────────────────────────────────

  describe('search', () => {
    it('matches invoice number, payment method and customer, and reports the total', async () => {
      const customer = await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({
          name: 'Zubair Khan', phone: '03009998888',
          creditEnabled: true, creditLimit: 500000,
        }),
      );
      const withCustomer = await service.create({
        customerId: customer.id,
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        paymentMethod: 'CREDIT',
        paidAmount: 0,
      });
      await service.create({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        paymentMethod: 'CASH',
      });

      // By invoice number.
      const byNo = await service.search({ search: withCustomer.invoiceNo });
      expect(byNo.total).toBe(1);
      expect(byNo.rows[0].id).toBe(withCustomer.id);

      // By customer name — a join, not a column on the sale.
      const byName = await service.search({ search: 'zubair' });
      expect(byName.total).toBe(1);

      // By payment method.
      expect((await service.search({ search: 'CREDIT' })).total).toBe(1);

      // No term = everything, still paged.
      const all = await service.search({});
      expect(all.total).toBe(2);
      expect(all.limit).toBe(100);
    });

    it('pages, and the total describes the whole match set not the page', async () => {
      for (let i = 0; i < 5; i += 1) {
        await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 100 }] });
      }
      const first = await service.search({ limit: 2 });
      expect(first.rows).toHaveLength(2);
      expect(first.total).toBe(5);

      const second = await service.search({ limit: 2, offset: 2 });
      expect(second.rows).toHaveLength(2);
      expect(second.rows[0].id).not.toBe(first.rows[0].id);

      const last = await service.search({ limit: 2, offset: 4 });
      expect(last.rows).toHaveLength(1);
    });

    it('caps a caller-supplied limit rather than trusting it', async () => {
      const res = await service.search({ limit: 99999 });
      expect(res.limit).toBe(500);
    });
  });

  // ─── voucher editing (sale + its receipt splits) ──────────────────────────

  describe('editFromVoucher', () => {
    let cashId: string;
    let bankId: string;

    beforeEach(async () => {
      const repo = ds.getRepository(Account);
      cashId = (await repo.save(repo.create({ name: 'Till', type: 'CASH' }))).id;
      bankId = (await repo.save(repo.create({ name: 'Bank', type: 'BANK' }))).id;
    });

    /** Live (non-reversed) receipts raised by a voucher. */
    const splitsOf = async (saleId: string) =>
      ds.getRepository(Payment).find({
        where: { referenceType: 'SALE_SPLIT', referenceId: saleId },
        order: { createdAt: 'ASC' },
      });

    it('corrects lines and re-issues the receipts, keeping the invoice number', async () => {
      const { sale } = await service.createFromVoucher({
        lines: [{ itemId, quantity: 2, unitPrice: 500 }],
        splits: [{ amount: 1000, accountId: cashId, kind: 'CASH' }],
      });
      expect(await stock.getOnHand(itemId)).toBe(8);

      const { sale: edited, receipts } = await service.editFromVoucher(
        sale.id,
        {
          lines: [{ itemId, quantity: 1, unitPrice: 500 }],
          splits: [{ amount: 500, accountId: cashId, kind: 'CASH' }],
        },
        { reason: 'one unit, not two' },
      );

      expect(edited.id).toBe(sale.id);
      expect(edited.invoiceNo).toBe(sale.invoiceNo);
      expect(Number(edited.netAmount)).toBe(500);
      expect(Number(edited.dueAmount)).toBe(0);
      expect(await stock.getOnHand(itemId)).toBe(9);
      expect(edited.editCount).toBe(1);

      // The old receipt is reversed (kept on the record, no longer counting) and
      // a fresh one issued for the corrected amount.
      const all = await splitsOf(sale.id);
      expect(all).toHaveLength(2);
      expect(all.filter((p) => p.reversedAt)).toHaveLength(1);
      const live = all.filter((p) => !p.reversedAt);
      expect(live).toHaveLength(1);
      expect(Number(live[0].amount)).toBe(500);
      expect(receipts).toHaveLength(1);
    });

    it('can move the payment to a different account', async () => {
      const { sale } = await service.createFromVoucher({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        splits: [{ amount: 500, accountId: cashId, kind: 'CASH' }],
      });

      await service.editFromVoucher(
        sale.id,
        {
          lines: [{ itemId, quantity: 1, unitPrice: 500 }],
          splits: [{ amount: 500, accountId: bankId, kind: 'CASH' }],
        },
        { reason: 'went into the bank, not the till' },
      );

      const live = (await splitsOf(sale.id)).filter((p) => !p.reversedAt);
      expect(live).toHaveLength(1);
      expect(live[0].accountId).toBe(bankId);
    });

    it('can split one payment into two', async () => {
      const { sale } = await service.createFromVoucher({
        lines: [{ itemId, quantity: 1, unitPrice: 1000 }],
        splits: [{ amount: 1000, accountId: cashId, kind: 'CASH' }],
      });

      await service.editFromVoucher(
        sale.id,
        {
          lines: [{ itemId, quantity: 1, unitPrice: 1000 }],
          splits: [
            { amount: 600, accountId: cashId, kind: 'CASH' },
            { amount: 400, accountId: bankId, kind: 'CASH' },
          ],
        },
        { reason: 'half cash, half transfer' },
      );

      const live = (await splitsOf(sale.id)).filter((p) => !p.reversedAt);
      expect(live).toHaveLength(2);
      expect(live.reduce((s, p) => s + Number(p.amount), 0)).toBe(1000);
      expect(Number((await service.findOne(sale.id)).dueAmount)).toBe(0);
    });

    it('turns a fully-paid voucher into a part-paid one, leaving the residual owed', async () => {
      const customer = await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({
          name: 'Booking customer', creditEnabled: true, creditLimit: 100000,
        }),
      );
      const { sale } = await service.createFromVoucher({
        customerId: customer.id,
        lines: [{ itemId, quantity: 1, unitPrice: 1000 }],
        splits: [{ amount: 1000, accountId: cashId, kind: 'CASH' }],
      });
      expect(Number(sale.dueAmount)).toBe(0);

      const { sale: edited } = await service.editFromVoucher(
        sale.id,
        {
          customerId: customer.id,
          lines: [{ itemId, quantity: 1, unitPrice: 1000 }],
          splits: [{ amount: 300, accountId: cashId, kind: 'CASH' }],
        },
        { reason: 'only 300 was taken as advance' },
      );

      expect(Number(edited.paidAmount)).toBe(300);
      expect(Number(edited.dueAmount)).toBe(700);
    });

    it('applies voucher validation to the correction', async () => {
      const { sale } = await service.createFromVoucher({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        splits: [{ amount: 500, accountId: cashId, kind: 'CASH' }],
      });

      // Splits exceeding the net is refused on create; it must be refused here.
      await expect(
        service.editFromVoucher(
          sale.id,
          {
            lines: [{ itemId, quantity: 1, unitPrice: 500 }],
            splits: [{ amount: 900, accountId: cashId, kind: 'CASH' }],
          },
          { reason: 'over-collect' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Untouched.
      expect(Number((await service.findOne(sale.id)).netAmount)).toBe(500);
    });

    it('requires a reason and refuses a reversed voucher', async () => {
      const { sale } = await service.createFromVoucher({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        splits: [{ amount: 500, accountId: cashId, kind: 'CASH' }],
      });
      const good = {
        lines: [{ itemId, quantity: 1, unitPrice: 450 }],
        splits: [{ amount: 450, accountId: cashId, kind: 'CASH' as const }],
      };

      await expect(
        service.editFromVoucher(sale.id, good, { reason: '  ' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await service.reverse(sale.id, { reason: 'voided' });
      await expect(
        service.editFromVoucher(sale.id, good, { reason: 'too late' }),
      ).rejects.toThrow(/reversed/i);
    });
  });

  // ─── editing ──────────────────────────────────────────────────────────────

  describe('edit', () => {
    it('corrects quantity and price, keeping the invoice number and row', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 3, unitPrice: 500 }],
        paymentMethod: 'CASH',
      });
      expect(await stock.getOnHand(itemId)).toBe(7);

      const edited = await service.edit(
        sale.id,
        { lines: [{ itemId, quantity: 2, unitPrice: 450 }], paymentMethod: 'CASH' },
        { reason: 'price agreed was 450 for 2, not 500 for 3' },
      );

      // Same document, corrected content.
      expect(edited.id).toBe(sale.id);
      expect(edited.invoiceNo).toBe(sale.invoiceNo);
      expect(Number(edited.netAmount)).toBe(900);
      expect(edited.lines).toHaveLength(1);
      expect(Number(edited.lines[0].quantity)).toBe(2);
      // Stock reflects 2 sold, not 3 — the original OUT was mirrored back.
      expect(await stock.getOnHand(itemId)).toBe(8);
      // And it says it was edited.
      expect(edited.editCount).toBe(1);
      expect(edited.lastEditReason).toContain('450');
      expect(edited.lastEditedAt).toBeTruthy();
    });

    it('leaves the stock ledger auditable — original, unwind, correction', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 3, unitPrice: 500 }],
      });
      await service.edit(
        sale.id,
        { lines: [{ itemId, quantity: 1, unitPrice: 500 }] },
        { reason: 'only one went out' },
      );

      const moves = await ds.getRepository(StockMovement).find({
        where: { referenceId: sale.id },
        order: { createdAt: 'ASC' },
      });
      // OUT 3 (original), IN 3 (unwind), OUT 1 (correction) — nothing deleted.
      expect(moves.map((m) => `${m.type}${m.quantity}`)).toEqual([
        'OUT3',
        'IN3',
        'OUT1',
      ]);
    });

    it('can change the customer and the payment terms', async () => {
      const c1 = await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({
          name: 'Right customer', creditEnabled: true, creditLimit: 100000,
        }),
      );
      const sale = await service.create({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        paymentMethod: 'CASH',
      });

      const edited = await service.edit(
        sale.id,
        {
          customerId: c1.id,
          lines: [{ itemId, quantity: 1, unitPrice: 500 }],
          paymentMethod: 'CREDIT',
          paidAmount: 0,
        },
        { reason: 'was a credit sale to the wrong walk-in' },
      );

      expect(edited.customerId).toBe(c1.id);
      expect(edited.paymentMethod).toBe('CREDIT');
      expect(Number(edited.dueAmount)).toBe(500);
      // CREDIT sales must not pin an account, same rule as on create.
      expect(edited.accountId).toBeFalsy();
    });

    it('recosts, so the costed pool reflects the corrected sale', async () => {
      // Give the item an opening cost basis — this fixture seeds stock with a
      // raw movement rather than a purchase, so without an opening basis there
      // is no cost history to replay and everything derives to zero.
      const repo = ds.getRepository(Item);
      const it = await repo.findOneByOrFail({ id: itemId });
      it.openingCostedQty = 10;
      it.openingAvgCost = 300;
      await repo.save(it);

      const sale = await service.create({
        lines: [{ itemId, quantity: 4, unitPrice: 500 }],
      });

      await service.edit(
        sale.id,
        { lines: [{ itemId, quantity: 1, unitPrice: 500 }] },
        { reason: 'three were never collected' },
      );

      // Derived from what survives: 10 carried in, 1 sold on the corrected
      // invoice. The withdrawn 3 units are back in the pool.
      expect(Number((await repo.findOneByOrFail({ id: itemId })).costedQty)).toBe(9);
    });

    it('requires a reason and refuses to edit a reversed sale', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      await expect(
        service.edit(sale.id, { lines: [{ itemId, quantity: 1, unitPrice: 400 }] }, { reason: '  ' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await service.reverse(sale.id, { reason: 'voided' });
      await expect(
        service.edit(
          sale.id,
          { lines: [{ itemId, quantity: 1, unitPrice: 400 }] },
          { reason: 'too late' },
        ),
      ).rejects.toThrow(/reversed/i);
    });

    it('refuses while a return, delivery or service ticket depends on it', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      });
      const newLines = [{ itemId, quantity: 1, unitPrice: 500 }];

      // A return priced off these lines.
      const sr = await ds.getRepository(SaleReturn).save(
        ds.getRepository(SaleReturn).create({
          returnNo: 'SR-DEP-1', saleId: sale.id, totalAmount: 500, lines: [],
        }),
      );
      await expect(
        service.edit(sale.id, { lines: newLines }, { reason: 'x' }),
      ).rejects.toThrow(/return/i);
      await ds.getRepository(SaleReturn).remove(sr);

      // A delivery holding a reservation derived from these lines.
      const dl = await ds.getRepository(Delivery).save(
        ds.getRepository(Delivery).create({
          deliveryNo: 'DLV-DEP-1', saleId: sale.id, status: 'PENDING',
        }),
      );
      await expect(
        service.edit(sale.id, { lines: newLines }, { reason: 'x' }),
      ).rejects.toThrow(/delivery/i);
      await ds.getRepository(Delivery).remove(dl);

      // A service ticket pointing at one of the lines.
      const fresh = await service.findOne(sale.id);
      await ds.getRepository(ServiceTicket).save(
        ds.getRepository(ServiceTicket).create({
          ticketNo: 'SVC-DEP-1',
          complaint: 'rattles',
          saleItemId: fresh.lines[0].id,
          status: 'RECEIVED',
          receivedAt: new Date().toISOString().slice(0, 10),
        }),
      );
      await expect(
        service.edit(sale.id, { lines: newLines }, { reason: 'x' }),
      ).rejects.toThrow(/service ticket/i);
    });

    it('refuses a voucher sale, which carries its payment as separate receipts', async () => {
      const cash = await ds.getRepository(Account).save(
        ds.getRepository(Account).create({ name: 'Till', type: 'CASH' }),
      );
      const { sale } = await service.createFromVoucher({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        splits: [{ amount: 500, accountId: cash.id, kind: 'CASH' }],
      });

      // Editing only the Sale would leave the RCT receipt standing against a
      // changed total — the money would be counted twice.
      await expect(
        service.edit(
          sale.id,
          { lines: [{ itemId, quantity: 1, unitPrice: 400 }] },
          { reason: 'price wrong' },
        ),
      ).rejects.toThrow(/voucher/i);
    });

    it('rolls the whole edit back when the corrected version is invalid', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      });

      // 8 on hand + 2 coming back on the unwind = 10; asking for 50 can't work.
      await expect(
        service.edit(
          sale.id,
          { lines: [{ itemId, quantity: 50, unitPrice: 500 }] },
          { reason: 'fat finger' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Untouched: still the original sale, still 8 on hand, no edit recorded.
      const after = await service.findOne(sale.id);
      expect(Number(after.lines[0].quantity)).toBe(2);
      expect(after.editCount).toBe(0);
      expect(await stock.getOnHand(itemId)).toBe(8);
    });
  });
});
