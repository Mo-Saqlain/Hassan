import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';

import { Account } from '../accounts/entities/account.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Item } from '../items/entities/item.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Store } from '../stores/entities/store.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { PurchaseItem } from '../purchases/entities/purchase-item.entity';
import { Payment } from '../payments/entities/payment.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeTransaction } from '../employee-transactions/entities/employee-transaction.entity';
import { FundTransfer } from '../fund-transfers/entities/fund-transfer.entity';
import { CashEntry } from './entities/cash-entry.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';

import { CashRegisterService } from './cash-register.service';
import { FundTransfersService } from '../fund-transfers/fund-transfers.service';

const ENTITIES = [
  Account, Brand, Category, Item, Customer, Supplier, Store,
  Sale, SaleItem, Purchase, PurchaseItem, Payment,
  SaleReturn, SaleReturnItem, Employee, EmployeeTransaction,
  FundTransfer, CashEntry, CashRegisterSession,
];

// The cash register only ever calls two read methods on FundTransfersService
// (findInvolvingAccounts / groupDeltaAt); stub them so we don't drag in that
// service's whole dependency graph. This suite is about the till maths.
const fundTransfersStub = {
  findInvolvingAccounts: async () => [],
  groupDeltaAt: async () => 0,
  create: async () => ({}),
};

describe('CashRegisterService — till captures all cash movements', () => {
  let service: CashRegisterService;
  let ds: DataSource;
  let cashId: string;
  let employeeId: string;
  const day = new Date().toISOString().slice(0, 10);

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm(ENTITIES)),
        TypeOrmModule.forFeature(ENTITIES),
      ],
      providers: [
        CashRegisterService,
        { provide: FundTransfersService, useValue: fundTransfersStub },
      ],
    }).compile();
    await moduleRef.init();

    service = moduleRef.get(CashRegisterService);
    ds = moduleRef.get(DataSource);

    const cash = await ds.getRepository(Account).save(
      ds.getRepository(Account).create({
        name: 'Till', type: 'CASH', openingBalance: 0,
      }),
    );
    cashId = cash.id;

    const emp = await ds.getRepository(Employee).save(
      ds.getRepository(Employee).create({ name: 'Cashier' }),
    );
    employeeId = emp.id;

    // Cash sale +1000
    await ds.getRepository(Sale).save(
      ds.getRepository(Sale).create({
        invoiceNo: 'INV-1', paymentMethod: 'CASH',
        totalAmount: 1000, netAmount: 1000, paidAmount: 1000, dueAmount: 0,
      }),
    );
    // Salary paid from the till -300
    await ds.getRepository(EmployeeTransaction).save(
      ds.getRepository(EmployeeTransaction).create({
        voucherNo: 'SAL-1', employeeId, type: 'SALARY',
        transactionDate: day, amount: 300, accountId: cashId,
      }),
    );
    // Cash refund on a return -200
    await ds.getRepository(SaleReturn).save(
      ds.getRepository(SaleReturn).create({
        returnNo: 'SR-1', totalAmount: 200,
        refundAccountId: cashId, refundAmount: 200, lines: [],
      }),
    );
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('subtracts cash salary and cash refund from the day closing', async () => {
    const book = await service.dailyBook(day);
    expect(book.opening).toBe(0);
    expect(book.totals.in).toBe(1000); // cash sale
    expect(book.totals.out).toBe(500); // 300 salary + 200 refund
    expect(book.closing).toBe(500);

    const emp = book.entries.find((e) => e.source === 'EMPLOYEE');
    expect(emp?.direction).toBe('OUT');
    expect(emp?.amount).toBe(300);

    const refund = book.entries.find((e) => e.source === 'REFUND');
    expect(refund?.direction).toBe('OUT');
    expect(refund?.amount).toBe(200);
  });

  it('ignores out-of-pocket expense (no cash account) and SALARY_ACCRUED', async () => {
    await ds.getRepository(EmployeeTransaction).save(
      ds.getRepository(EmployeeTransaction).create({
        voucherNo: 'EXP-1', employeeId, type: 'EXPENSE',
        transactionDate: day, amount: 999, accountId: undefined,
      }),
    );
    await ds.getRepository(EmployeeTransaction).save(
      ds.getRepository(EmployeeTransaction).create({
        voucherNo: 'SALA-1', employeeId, type: 'SALARY_ACCRUED',
        transactionDate: day, amount: 888, accountId: cashId,
      }),
    );
    const book = await service.dailyBook(day);
    // Still only the 300 salary + 200 refund — the accrual and out-of-pocket
    // expense must not touch the till.
    expect(book.totals.out).toBe(500);
    expect(book.closing).toBe(500);
  });

  it("carries the till outflows into the next day's expected opening", async () => {
    // sessionStatus for tomorrow computes expectedOpening = cash on hand as of
    // today, which must already reflect the salary + refund outflows.
    const tomorrow = new Date(`${day}T00:00:00.000Z`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const status = await service.sessionStatus(
      tomorrow.toISOString().slice(0, 10),
    );
    expect(status.expectedOpening).toBe(500);
  });
});
