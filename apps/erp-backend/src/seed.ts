/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
/**
 * Stress-test data seeder.
 *
 * Boots the Nest application *context* (no HTTP server, so the global
 * AuthGuard never fires) and drives the real domain services, so every row it
 * writes is internally consistent — stock movements, double-entry journals,
 * serial bindings, weighted-average cost roll-ups and sequence numbers all
 * come out exactly as they would in production.
 *
 * Target DB: always local SQLite. We blank `DATABASE_URL` *before* AppModule is
 * imported (see the dynamic import in `main`) so `buildDbOptions()` falls back
 * to better-sqlite3 even if `.env` points at Supabase. It uses the same
 * `erp.sqlite` the dev server (`npm run start:dev`) opens, so the data shows up
 * immediately in the running app.
 *
 *   npm run seed                  # heavy (default)
 *   SEED_SCALE=light  npm run seed
 *   SEED_SCALE=medium npm run seed
 *
 * Every write is wrapped in `track()` — one bad row never aborts the run; a
 * per-phase tally prints at the end. Re-runnable: each run appends a fresh
 * batch (names carry a run tag so unique constraints don't clash).
 */

// MUST run before AppModule is imported — forces the SQLite code path.
process.env.DATABASE_URL = '';
// Don't let the outbox try to reach a cloud URL while seeding.
delete process.env.CLOUD_SYNC_URL;

type Scale = Record<string, number>;

const SCALES: Record<string, Scale> = {
  light: {
    brands: 6, categories: 8, stores: 2, accounts: 5, employees: 6,
    suppliers: 8, customers: 15, items: 40, sales: 150, voucherSales: 20,
    posSales: 15, receipts: 40, supplierPayments: 30, saleReturns: 12,
    purchaseReturns: 8, serviceTickets: 15, deliveries: 25, fundTransfers: 10,
    stockTransfers: 8, damagedGoods: 10, purchaseOrders: 15, attendanceDays: 7,
    employeeTxns: 20, incentiveTargets: 6, incentiveAwards: 8, incentiveRules: 6,
    cashDays: 5, cashEntries: 20,
  },
  medium: {
    brands: 12, categories: 12, stores: 3, accounts: 7, employees: 12,
    suppliers: 20, customers: 40, items: 120, sales: 800, voucherSales: 80,
    posSales: 60, receipts: 150, supplierPayments: 120, saleReturns: 50,
    purchaseReturns: 30, serviceTickets: 80, deliveries: 120, fundTransfers: 30,
    stockTransfers: 25, damagedGoods: 40, purchaseOrders: 60, attendanceDays: 14,
    employeeTxns: 100, incentiveTargets: 15, incentiveAwards: 20, incentiveRules: 15,
    cashDays: 10, cashEntries: 60,
  },
  heavy: {
    brands: 18, categories: 16, stores: 3, accounts: 8, employees: 20,
    suppliers: 60, customers: 150, items: 400, sales: 5000, voucherSales: 250,
    posSales: 150, receipts: 400, supplierPayments: 300, saleReturns: 150,
    purchaseReturns: 80, serviceTickets: 200, deliveries: 300, fundTransfers: 80,
    stockTransfers: 60, damagedGoods: 80, purchaseOrders: 120, attendanceDays: 21,
    employeeTxns: 200, incentiveTargets: 30, incentiveAwards: 40, incentiveRules: 25,
    cashDays: 15, cashEntries: 100,
  },
};

const SCALE = SCALES[process.env.SEED_SCALE ?? 'heavy'] ?? SCALES.heavy;
const RUN = Date.now().toString(36).slice(-5); // keeps names unique across runs

/* ───────────────────────────── tiny helpers ───────────────────────────── */

const ri = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const rf = (lo: number, hi: number) => Number((lo + Math.random() * (hi - lo)).toFixed(2));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const chance = (p: number) => Math.random() < p;
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const BRANDS = ['Dawlance', 'Haier', 'PEL', 'Orient', 'Gree', 'Kenwood', 'Samsung', 'LG', 'TCL', 'Changhong Ruba', 'Waves', 'Super Asia', 'Homage', 'Panasonic', 'Hitachi', 'Midea', 'Ecostar', 'Singer'];
const CAT_SEED: [string, string][] = [
  ['Air Conditioners', 'AC'], ['Refrigerators', 'FRIDGE'], ['Deep Freezers', 'FREEZER'],
  ['Washing Machines', 'WASHER'], ['Microwave Ovens', 'MWAVE'], ['LED TVs', 'LEDTV'],
  ['Water Dispensers', 'DISP'], ['Air Coolers', 'COOLER'], ['Fans', 'FAN'],
  ['Water Heaters', 'GEYSER'], ['Irons', 'IRON'], ['Blenders', 'BLEND'],
  ['Vacuum Cleaners', 'VACUUM'], ['Sewing Machines', 'SEWING'], ['UPS', 'UPS'],
  ['Small Appliances', 'SMALL'],
];
const FIRST = ['Muhammad', 'Ahmed', 'Ali', 'Hassan', 'Usman', 'Bilal', 'Imran', 'Kamran', 'Fahad', 'Saad', 'Zain', 'Hamza', 'Tariq', 'Adnan', 'Rizwan', 'Asad', 'Nabeel', 'Waqar', 'Yasir', 'Junaid', 'Faisal', 'Shahid', 'Naveed', 'Aamir'];
const LAST = ['Khan', 'Ahmed', 'Malik', 'Sheikh', 'Butt', 'Raza', 'Hussain', 'Iqbal', 'Javed', 'Aslam', 'Nawaz', 'Qureshi', 'Chaudhry', 'Siddiqui', 'Ansari', 'Bhatti', 'Mughal', 'Awan'];
const SUPPLIER_TYPES = ['Distributors', 'Traders', 'Electronics', 'Enterprises', 'Agencies', 'Corporation', 'Sons', 'Brothers', 'Impex', 'Marketing'];
const CITIES = ['Lahore', 'Karachi', 'Faisalabad', 'Rawalpindi', 'Multan', 'Gujranwala', 'Sialkot', 'Peshawar'];
const ROLES = ['Salesman', 'Cashier', 'Technician', 'Delivery', 'Store Keeper', 'Accountant', 'Manager'];
const COMPLAINTS = ['Not cooling', 'Compressor noise', 'Water leakage', 'Not powering on', 'Display flickering', 'Remote not working', 'Gas refill needed', 'Strange smell', 'Door seal damaged', 'Overheating'];

const personName = () => `${pick(FIRST)} ${pick(LAST)}`;

/* ─────────────────────────── result accounting ─────────────────────────── */

const tally: Record<string, { ok: number; fail: number; sample?: string }> = {};
function note(phase: string, ok: boolean, err?: any) {
  const t = (tally[phase] ??= { ok: 0, fail: 0 });
  if (ok) t.ok += 1;
  else {
    t.fail += 1;
    if (!t.sample) t.sample = (err?.message ?? String(err)).slice(0, 200);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// better-sqlite3 + TypeORM occasionally throws a transient "cannot start a
// transaction within a transaction" / "no such savepoint" when the audit
// subscriber's write interleaves with a service transaction. It's a race on a
// rolled-back connection, so a short retry clears it. Real validation errors
// (unbalanced journal, insufficient stock) repeat identically and fall through.
async function track<T>(phase: string, fn: () => Promise<T>, ignore?: RegExp): Promise<T | null> {
  let lastErr: any;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fn();
      note(phase, true);
      return r;
    } catch (e: any) {
      lastErr = e;
      // Re-run collisions (e.g. a one-per-day cash session) aren't failures —
      // swallow them silently so a repeat seed stays green.
      if (ignore && ignore.test(e?.message ?? '')) return null;
      const transient = /transaction within a transaction|no such savepoint|database table is locked|database is locked/i.test(
        e?.message ?? '',
      );
      if (!transient) break;
      await sleep(20 * (attempt + 1));
    }
  }
  note(phase, false, lastErr);
  return null;
}

let lastTick = Date.now();
function progress(phase: string, i: number, total: number) {
  if (i >= total || Date.now() - lastTick > 3000) {
    lastTick = Date.now();
    if (i >= total) process.stdout.write(`  ${phase}: ${total}/${total} ✓\n`);
    else process.stdout.write(`  ${phase}: ${i}/${total}\r`);
  }
}

/* ───────────────────────────────── main ───────────────────────────────── */

async function main() {
  const t0 = Date.now();
  console.log(`\n🌱  Seeding (scale=${process.env.SEED_SCALE ?? 'heavy'}, run=${RUN}) → local SQLite\n`);

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  // The AuditSubscriber fires `audit.record(...)` fire-and-forget (un-awaited)
  // on every insert/update. Under the seed's tight loop those queued audit
  // INSERTs land on the shared better-sqlite3 connection *inside* a later
  // `dataSource.transaction()`, issuing a second BEGIN → "no such savepoint" →
  // the transaction is poisoned and silently rolls back on close (only
  // autocommit `repo.save` master data survived). Detaching the subscriber for
  // the seed run removes the interleaving entirely. Synthetic rows don't need
  // an audit trail; the live app keeps its subscriber untouched.
  const { DataSource } = await import('typeorm');
  const ds0: any = app.get(DataSource);
  ds0.subscribers = ds0.subscribers.filter(
    (s: any) => s?.constructor?.name !== 'AuditSubscriber',
  );

  const S = (mod: string, cls: string) =>
    app.get(require(`./modules/${mod}/${mod}.service`)[cls]);

  const brandsSvc = S('brands', 'BrandsService');
  const categoriesSvc = S('categories', 'CategoriesService');
  const itemsSvc = S('items', 'ItemsService');
  const customersSvc = S('customers', 'CustomersService');
  const suppliersSvc = S('suppliers', 'SuppliersService');
  const storesSvc = S('stores', 'StoresService');
  const accountsSvc = S('accounts', 'AccountsService');
  const employeesSvc = S('employees', 'EmployeesService');
  const purchasesSvc = S('purchases', 'PurchasesService');
  const salesSvc = S('sales', 'SalesService');
  const paymentsSvc = S('payments', 'PaymentsService');
  const posSvc = S('pos', 'PosService');
  const returnsSvc = S('returns', 'ReturnsService');
  const ticketsSvc = S('service-tickets', 'ServiceTicketsService');
  const deliveriesSvc = S('deliveries', 'DeliveriesService');
  const fundsSvc = S('fund-transfers', 'FundTransfersService');
  const transfersSvc = S('stock-transfers', 'StockTransfersService');
  const damagedSvc = S('damaged-goods', 'DamagedGoodsService');
  const poSvc = S('purchase-orders', 'PurchaseOrdersService');
  const attendanceSvc = S('attendance', 'AttendanceService');
  const empTxnSvc = S('employee-transactions', 'EmployeeTransactionsService');
  const incentivesSvc = S('incentives', 'IncentivesService');
  const empIncentivesSvc = S('employee-incentives', 'EmployeeIncentivesService');
  const cashSvc = S('cash-register', 'CashRegisterService');
  const usersSvc = S('users', 'UsersService');

  // In-memory ledgers so we never drive stock negative or oversell a serial.
  const onHand = new Map<string, number>();
  const serialPool = new Map<string, string[]>();
  const addStock = (id: string, q: number) => onHand.set(id, (onHand.get(id) ?? 0) + q);
  const takeStock = (id: string, want: number) => {
    const have = onHand.get(id) ?? 0;
    const take = Math.min(have, want);
    if (take > 0) onHand.set(id, have - take);
    return take;
  };
  const takeSerials = (id: string, n: number) => (serialPool.get(id) ?? []).splice(0, n);

  /* ── master data ───────────────────────────────────────────────────── */
  console.log('▸ Master data');

  const brandIds: string[] = [];
  for (let i = 0; i < SCALE.brands; i++) {
    const b: any = await track('brands', () =>
      brandsSvc.create({ name: `${BRANDS[i % BRANDS.length]}${i >= BRANDS.length ? ' ' + RUN + i : ''}` }));
    if (b) brandIds.push(b.id);
  }

  const stores: any[] = [];
  for (let i = 0; i < SCALE.stores; i++) {
    const s: any = await track('stores', () =>
      storesSvc.create({ name: `${i === 0 ? 'Main Showroom' : 'Branch ' + i} ${RUN}`, location: pick(CITIES) }));
    if (s) stores.push(s);
  }
  const store0 = stores[0]?.id;
  const store1 = stores[1]?.id ?? store0;

  const categoryIds: string[] = [];
  for (let i = 0; i < SCALE.categories; i++) {
    const [name, code] = CAT_SEED[i % CAT_SEED.length];
    const parentId = i > 6 && categoryIds.length && chance(0.4) ? pick(categoryIds) : undefined;
    // Codes are globally unique (app-layer), so tag with the run id to keep
    // re-runs from colliding. 3 chars of the base code + the 5-char run = 8.
    const c: any = await track('categories', () =>
      categoriesSvc.create({
        name: `${name} ${RUN}${i >= CAT_SEED.length ? i : ''}`,
        code: `${code.slice(0, 3)}${RUN}`.toUpperCase().slice(0, 8),
        parentId,
      }));
    if (c) categoryIds.push(c.id);
  }

  const accTypes = ['CASH', 'BANK', 'WALLET', 'CAPITAL', 'CREDIT'];
  const cashAccts: string[] = [];
  const bankAccts: string[] = [];
  for (let i = 0; i < SCALE.accounts; i++) {
    const type = i < accTypes.length ? accTypes[i] : pick(accTypes);
    const a: any = await track('accounts', () =>
      accountsSvc.create({
        name: `${type} ${i + 1} ${RUN}`,
        type,
        openingBalance: type === 'CAPITAL' ? rf(500000, 5000000) : rf(0, 200000),
        bank: type === 'BANK' ? pick(['HBL', 'Meezan', 'UBL', 'Allied', 'Alfalah']) : undefined,
      }));
    if (a) {
      if (type === 'CASH') cashAccts.push(a.id);
      if (type === 'BANK') bankAccts.push(a.id);
    }
  }
  // Everything downstream (payments, voucher splits) needs a real account id,
  // so guarantee at least one cash account even if the loop above came up short.
  if (!cashAccts.length) {
    const a: any = await track('accounts', () =>
      accountsSvc.create({ name: `CASH primary ${RUN}`, type: 'CASH', openingBalance: 0 }));
    if (a) cashAccts.push(a.id);
  }
  const cashAcct = cashAccts[0];
  const bankAcct = bankAccts[0] ?? cashAcct;

  const employees: any[] = [];
  for (let i = 0; i < SCALE.employees; i++) {
    const e: any = await track('employees', () =>
      employeesSvc.create({
        name: personName(),
        role: pick(ROLES),
        phone: `03${ri(0, 4)}${ri(1000000, 9999999)}`,
        monthlySalary: rf(30000, 150000),
        joinedAt: isoDate(daysAgo(ri(60, 1500))),
        salaryDay: ri(1, 28),
      }));
    if (e) employees.push(e);
  }

  const suppliers: any[] = [];
  for (let i = 0; i < SCALE.suppliers; i++) {
    const s: any = await track('suppliers', () =>
      suppliersSvc.create({
        name: `${pick(LAST)} ${pick(SUPPLIER_TYPES)} ${RUN}-${i}`,
        phone: `042${ri(1000000, 9999999)}`,
        address: pick(CITIES),
        openingBalance: chance(0.3) ? rf(0, 500000) : 0,
      }));
    if (s) suppliers.push(s);
  }

  const customers: any[] = [];
  for (let i = 0; i < SCALE.customers; i++) {
    const c: any = await track('customers', () =>
      customersSvc.create({
        name: `${personName()} ${RUN}-${i}`,
        phone: `03${ri(0, 4)}${ri(1000000, 9999999)}`,
        address: pick(CITIES),
        openingBalance: chance(0.2) ? rf(0, 100000) : 0,
        creditEnabled: true,
        // High ceilings so a stress run's repeated credit sales to the same
        // buyer don't trip the limit guard (which is itself tested elsewhere).
        creditLimit: rf(10000000, 80000000),
      }));
    if (c) customers.push(c);
  }

  /* ── items ─────────────────────────────────────────────────────────── */
  console.log('▸ Items');
  const items: any[] = [];
  const WTYPES = ['COMPANY', 'SHOP', 'CHECKING_ONLY', 'NONE'];
  for (let i = 0; i < SCALE.items; i++) {
    const serialized = i % 5 < 2; // ~40% serial-tracked
    const hasWarranty = i % 4 !== 0;
    const purchase = rf(3000, 180000);
    const it: any = await track('items', () =>
      itemsSvc.create({
        modelNo: `MDL-${RUN}-${String(i).padStart(4, '0')}`,
        name: `${pick(BRANDS)} ${pick(CAT_SEED)[0]} ${ri(100, 999)}`,
        brandId: brandIds.length ? pick(brandIds) : undefined,
        categoryIds: categoryIds.length ? [pick(categoryIds)] : undefined,
        purchasePrice: purchase,
        salePrice: Number((purchase * rf(1.1, 1.5)).toFixed(2)),
        unit: 'pcs',
        minStockLevel: ri(2, 10),
        tracksSerials: serialized,
        serialRequiredOnSale: serialized && chance(0.5),
        hasWarranty,
        warrantyType: hasWarranty ? pick(WTYPES) : 'NONE',
        warrantyDays: hasWarranty ? pick([90, 180, 365, 365, 730]) : undefined,
      }));
    if (it) {
      items.push(it);
      progress('items', items.length, SCALE.items);
    }
  }
  const serialItems = items.filter((it) => it.tracksSerials);
  const bulkItems = items.filter((it) => !it.tracksSerials);

  /* ── purchases: build stock + register serials ─────────────────────── */
  console.log('▸ Purchases & stock');
  let serialSeq = 0;
  let pTotalEst = 0;
  for (const it of items) pTotalEst += it.tracksSerials ? 2 : 2;
  let pDone = 0;
  for (const it of items) {
    const rounds = it.tracksSerials ? ri(1, 3) : ri(1, 4);
    for (let r = 0; r < rounds; r++) {
      const qty = it.tracksSerials ? ri(4, 25) : ri(60, 600);
      let serials: string[] | undefined;
      if (it.tracksSerials) {
        serials = Array.from({ length: qty }, () => `SN-${RUN}-${(serialSeq++).toString(36).toUpperCase()}`);
      }
      const unitPrice = Number((Number(it.purchasePrice) * rf(0.85, 1.05)).toFixed(2));
      const net = unitPrice * qty;
      const ok = await track('purchases', () =>
        purchasesSvc.create({
          supplierId: chance(0.9) && suppliers.length ? pick(suppliers).id : undefined,
          storeId: store0,
          paidAmount: chance(0.6) ? net : rf(0, net),
          paymentMethod: pick(['CASH', 'BANK', 'CREDIT']),
          lines: [{ itemId: it.id, quantity: qty, unitPrice, serials }],
        }));
      if (ok) {
        addStock(it.id, qty);
        if (serials) serialPool.set(it.id, [...(serialPool.get(it.id) ?? []), ...serials]);
      }
      pDone++;
      progress('purchases', pDone, pTotalEst);
    }
  }
  progress('purchases', pTotalEst, pTotalEst);

  /* ── bulk sales via SalesService.create (non-serial items) ─────────── */
  console.log('▸ Sales (bulk)');
  const saleIds: string[] = [];
  for (let i = 0; i < SCALE.sales; i++) {
    const lines: any[] = [];
    for (let l = 0; l < ri(1, 4); l++) {
      const it = pick(bulkItems);
      if (!it) continue;
      const q = takeStock(it.id, ri(1, 5));
      if (q <= 0) continue;
      lines.push({ itemId: it.id, quantity: q, unitPrice: Number((Number(it.salePrice) * rf(0.95, 1.05)).toFixed(2)) });
    }
    if (!lines.length) { progress('sales', i + 1, SCALE.sales); continue; }
    const gross = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    // Discount is subtracted by the service to get netAmount; paidAmount must
    // be measured against the *net*, or the journal (Dr cash vs Cr revenue)
    // won't balance.
    const discount = chance(0.25) ? Number(rf(0, gross * 0.05).toFixed(2)) : 0;
    const net = Number((gross - discount).toFixed(2));
    const method = pick(['CASH', 'CASH', 'CARD', 'BANK', 'CREDIT']);
    const credit = method === 'CREDIT';
    const partial = !credit && chance(0.15);
    const cust = credit || partial ? pick(customers) : chance(0.5) ? pick(customers) : undefined;
    const paid = credit ? 0 : partial ? Number(rf(net * 0.2, net * 0.7).toFixed(2)) : net;
    const s: any = await track('sales', () =>
      salesSvc.create({
        customerId: cust?.id,
        storeId: store0,
        accountId: method === 'BANK' ? bankAcct : method === 'CREDIT' ? undefined : cashAcct,
        paymentMethod: method,
        discount,
        paidAmount: paid,
        expectedPaymentDate: paid < net ? isoDate(daysAhead(ri(7, 90))) : undefined,
        lines,
      }));
    if (s) saleIds.push(s.id);
    progress('sales', i + 1, SCALE.sales);
  }

  /* ── voucher sales: splits + receipts + serial binding ─────────────── */
  console.log('▸ Sales (voucher, serialised)');
  for (let i = 0; i < SCALE.voucherSales; i++) {
    const it = pick(serialItems);
    if (!it) break;
    const avail = serialPool.get(it.id)?.length ?? 0;
    const q = Math.min(avail, takeStock(it.id, ri(1, 2)));
    if (q <= 0) continue;
    const serials = takeSerials(it.id, q);
    const unitPrice = Number((Number(it.salePrice) * rf(0.95, 1.05)).toFixed(2));
    const net = unitPrice * q;
    const partial = chance(0.25);
    const cust = pick(customers);
    const splits = partial
      ? [{ kind: 'CASH', accountId: cashAcct, amount: Number((net * rf(0.3, 0.6)).toFixed(2)) }]
      : [{ kind: 'CASH', accountId: cashAcct, amount: net }];
    await track('voucherSales', () =>
      salesSvc.createFromVoucher({
        customerId: cust.id,
        storeId: store0,
        lines: [{ itemId: it.id, quantity: q, unitPrice, serials }],
        splits,
        expectedPaymentDate: partial ? isoDate(daysAhead(ri(10, 60))) : undefined,
      }));
    progress('voucherSales', i + 1, SCALE.voucherSales);
  }

  /* ── POS sales: session + cart + checkout ──────────────────────────── */
  console.log('▸ Sales (POS)');
  const adminId = (await usersSvc.listUsers().catch(() => []))?.[0]?.id;
  if (adminId && store0) {
    let session: any = await track('posSession', () =>
      posSvc.startSession({ storeId: store0, userId: adminId, openingFloat: rf(5000, 30000) }));
    for (let i = 0; i < SCALE.posSales; i++) {
      if (!session) break;
      const cartItems: any[] = [];
      for (let l = 0; l < ri(1, 3); l++) {
        const it = pick(bulkItems);
        if (!it?.sku) continue;
        const q = takeStock(it.id, 1);
        if (q <= 0) continue;
        const added = await track('posCart', () =>
          posSvc.addToCart(session.id, { code: it.sku, quantity: 1 }));
        if (added) cartItems.push(it);
      }
      if (!cartItems.length) { progress('posSales', i + 1, SCALE.posSales); continue; }
      const method = pick(['CASH', 'CASH', 'CARD']);
      await track('posSales', () =>
        posSvc.checkout(session.id, {
          paymentMethod: method,
          accountId: method === 'CARD' ? bankAcct : cashAcct,
          customerId: chance(0.4) ? pick(customers).id : undefined,
        }));
      progress('posSales', i + 1, SCALE.posSales);
      // Occasionally roll a fresh session to exercise session lifecycle.
      if (i > 0 && i % 50 === 0) {
        session = await track('posSession', () =>
          posSvc.startSession({ storeId: store0, userId: adminId, openingFloat: rf(5000, 30000) }));
      }
    }
  }

  /* ── standalone receipts (customer) + payments (supplier) ──────────── */
  console.log('▸ Payments');
  for (let i = 0; i < SCALE.receipts; i++) {
    await track('receipts', () =>
      paymentsSvc.create({
        direction: 'IN',
        accountId: chance(0.5) ? cashAcct : bankAcct,
        customerId: pick(customers).id,
        amount: rf(2000, 300000),
        notes: 'Counter receipt',
      }));
    progress('receipts', i + 1, SCALE.receipts);
  }
  for (let i = 0; i < SCALE.supplierPayments; i++) {
    await track('supplierPayments', () =>
      paymentsSvc.create({
        direction: 'OUT',
        accountId: chance(0.5) ? cashAcct : bankAcct,
        supplierId: pick(suppliers).id,
        amount: rf(5000, 800000),
        notes: 'Supplier payment',
      }));
    progress('supplierPayments', i + 1, SCALE.supplierPayments);
  }

  /* ── returns ───────────────────────────────────────────────────────── */
  console.log('▸ Returns');
  for (let i = 0; i < SCALE.saleReturns; i++) {
    const it = pick(bulkItems);
    if (!it) break;
    const q = ri(1, 2);
    await track('saleReturns', () =>
      returnsSvc.createSaleReturn({
        customerId: chance(0.8) ? pick(customers).id : undefined,
        storeId: store0,
        reason: pick(['Defective', 'Wrong model', 'Customer changed mind', 'Damaged in transit']),
        lines: [{ itemId: it.id, quantity: q, unitPrice: Number(it.salePrice) }],
      }));
    addStock(it.id, q); // returns put goods back
    progress('saleReturns', i + 1, SCALE.saleReturns);
  }
  for (let i = 0; i < SCALE.purchaseReturns; i++) {
    const it = pick(bulkItems);
    if (!it) break;
    const q = takeStock(it.id, 1);
    if (q <= 0) continue;
    await track('purchaseReturns', () =>
      returnsSvc.createPurchaseReturn({
        supplierId: chance(0.9) ? pick(suppliers).id : undefined,
        storeId: store0,
        reason: pick(['Faulty batch', 'Over-supply', 'Expired warranty stock']),
        lines: [{ itemId: it.id, quantity: q, unitPrice: Number(it.purchasePrice) }],
      }));
    progress('purchaseReturns', i + 1, SCALE.purchaseReturns);
  }

  /* ── service tickets ───────────────────────────────────────────────── */
  console.log('▸ Service tickets');
  const TICKET_STATUS = ['RECEIVED', 'SENT_TO_COMPANY', 'WAITING_PARTS', 'UNDER_REPAIR', 'READY_FOR_PICKUP', 'DELIVERED', 'UNREPAIRABLE'];
  for (let i = 0; i < SCALE.serviceTickets; i++) {
    const it = pick(items);
    await track('serviceTickets', () =>
      ticketsSvc.create({
        customerId: chance(0.85) ? pick(customers).id : undefined,
        itemDescription: it ? `${it.name} (${it.modelNo})` : 'Walk-in unit',
        complaint: pick(COMPLAINTS),
        inWarranty: chance(0.5),
        status: pick(TICKET_STATUS),
        receivedAt: isoDate(daysAgo(ri(0, 120))),
        estimatedCost: chance(0.6) ? rf(500, 25000) : undefined,
      }));
    progress('serviceTickets', i + 1, SCALE.serviceTickets);
  }

  /* ── deliveries ────────────────────────────────────────────────────── */
  console.log('▸ Deliveries');
  const DELIVERY_STATUS = ['PENDING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'INSTALLATION_PENDING', 'INSTALLED', 'CANCELLED'];
  for (let i = 0; i < SCALE.deliveries; i++) {
    await track('deliveries', () =>
      deliveriesSvc.create({
        saleId: saleIds.length && chance(0.7) ? pick(saleIds) : undefined,
        customerId: pick(customers).id,
        address: `House ${ri(1, 999)}, ${pick(CITIES)}`,
        phone: `03${ri(0, 4)}${ri(1000000, 9999999)}`,
        assignedTo: employees.length ? pick(employees).name : 'Rider',
        vehicle: pick(['Shehzore', 'Suzuki Bolan', 'Bike', 'Hiace']),
        status: pick(DELIVERY_STATUS),
        scheduledFor: isoDate(daysAhead(ri(-30, 14))),
      }));
    progress('deliveries', i + 1, SCALE.deliveries);
  }

  /* ── fund transfers ────────────────────────────────────────────────── */
  console.log('▸ Fund transfers');
  const allAccts = [...cashAccts, ...bankAccts];
  for (let i = 0; i < SCALE.fundTransfers; i++) {
    if (allAccts.length < 2) break;
    const from = pick(allAccts);
    let to = pick(allAccts);
    let guard = 0;
    while (to === from && guard++ < 10) to = pick(allAccts);
    if (to === from) continue;
    await track('fundTransfers', () =>
      fundsSvc.create({
        fromAccountId: from,
        toAccountId: to,
        amount: rf(5000, 500000),
        transferDate: isoDate(daysAgo(ri(0, 180))),
        notes: 'Cash management',
      }));
    progress('fundTransfers', i + 1, SCALE.fundTransfers);
  }

  /* ── stock transfers (between stores) ──────────────────────────────── */
  console.log('▸ Stock transfers');
  for (let i = 0; i < SCALE.stockTransfers; i++) {
    if (!store1 || store0 === store1) break;
    const it = pick(bulkItems);
    if (!it) break;
    const q = takeStock(it.id, ri(1, 5));
    if (q <= 0) continue;
    const ok = await track('stockTransfers', () =>
      transfersSvc.create({
        fromStoreId: store0,
        toStoreId: store1,
        transferDate: isoDate(daysAgo(ri(0, 90))),
        lines: [{ itemId: it.id, quantity: q }],
      }));
    addStock(it.id, q); // net-zero globally; goods still on hand
    void ok;
    progress('stockTransfers', i + 1, SCALE.stockTransfers);
  }

  /* ── damaged goods ─────────────────────────────────────────────────── */
  console.log('▸ Damaged goods');
  for (let i = 0; i < SCALE.damagedGoods; i++) {
    const it = pick(items);
    if (!it) break;
    const q = takeStock(it.id, 1);
    if (q <= 0) continue;
    await track('damagedGoods', () =>
      damagedSvc.create({
        itemId: it.id,
        storeId: store0,
        quantity: q,
        status: pick(['DAMAGED', 'IN_REPAIR', 'WRITE_OFF']),
        reportedOn: isoDate(daysAgo(ri(0, 120))),
        reason: pick(['Transit damage', 'Display unit', 'Customer return defect', 'Flood damage']),
      }));
    progress('damagedGoods', i + 1, SCALE.damagedGoods);
  }

  /* ── purchase orders ───────────────────────────────────────────────── */
  console.log('▸ Purchase orders');
  for (let i = 0; i < SCALE.purchaseOrders; i++) {
    if (!suppliers.length) break;
    const lines = Array.from({ length: ri(1, 4) }, () => {
      const it = pick(items);
      return { itemId: it.id, quantity: ri(2, 30), expectedUnitCost: Number(it.purchasePrice) };
    });
    await track('purchaseOrders', () =>
      poSvc.create({
        supplierId: pick(suppliers).id,
        orderDate: isoDate(daysAgo(ri(0, 200))),
        expectedDate: isoDate(daysAhead(ri(3, 30))),
        status: pick(['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED']),
        lines,
      }));
    progress('purchaseOrders', i + 1, SCALE.purchaseOrders);
  }

  /* ── attendance ────────────────────────────────────────────────────── */
  console.log('▸ Attendance');
  let attDone = 0;
  const attTotal = employees.length * SCALE.attendanceDays;
  for (const e of employees) {
    for (let d = 0; d < SCALE.attendanceDays; d++) {
      await track('attendance', () =>
        attendanceSvc.upsert({
          employeeId: e.id,
          date: isoDate(daysAgo(d)),
          status: pick(['PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE']),
        }));
      progress('attendance', ++attDone, attTotal);
    }
  }

  /* ── employee transactions ─────────────────────────────────────────── */
  console.log('▸ Employee transactions');
  const ETYPES = ['SALARY_ACCRUED', 'SALARY', 'ADVANCE', 'REIMBURSEMENT', 'EXPENSE', 'INCENTIVE_PAYOUT', 'ADJUSTMENT'];
  for (let i = 0; i < SCALE.employeeTxns; i++) {
    if (!employees.length) break;
    const type = pick(ETYPES);
    const cashFlows = ['SALARY', 'ADVANCE', 'REIMBURSEMENT', 'EXPENSE', 'INCENTIVE_PAYOUT'].includes(type);
    await track('employeeTxns', () =>
      empTxnSvc.create({
        employeeId: pick(employees).id,
        type,
        amount: rf(2000, 120000),
        accountId: cashFlows ? cashAcct : undefined,
        transactionDate: isoDate(daysAgo(ri(0, 200))),
        description: type,
      }));
    progress('employeeTxns', i + 1, SCALE.employeeTxns);
  }

  /* ── incentive targets + awards ────────────────────────────────────── */
  console.log('▸ Incentives');
  const targetIds: string[] = [];
  for (let i = 0; i < SCALE.incentiveTargets; i++) {
    const byBrand = chance(0.5) && brandIds.length;
    const t: any = await track('incentiveTargets', () =>
      incentivesSvc.createTarget({
        name: `Q-target ${RUN}-${i}`,
        basis: byBrand ? 'BRAND' : 'ITEM',
        brandId: byBrand ? pick(brandIds) : undefined,
        itemId: byBrand ? undefined : pick(items).id,
        periodStart: isoDate(daysAgo(60)),
        periodEnd: isoDate(daysAhead(30)),
        targetQuantity: ri(10, 100),
        incentiveAmount: rf(5000, 100000),
      }));
    if (t) targetIds.push(t.id);
    progress('incentiveTargets', i + 1, SCALE.incentiveTargets);
  }
  for (let i = 0; i < SCALE.incentiveAwards; i++) {
    await track('incentiveAwards', () =>
      incentivesSvc.createAward({
        targetId: targetIds.length && chance(0.7) ? pick(targetIds) : undefined,
        label: `Award ${RUN}-${i}`,
        awardedOn: isoDate(daysAgo(ri(0, 90))),
        amount: rf(3000, 80000),
      }));
    progress('incentiveAwards', i + 1, SCALE.incentiveAwards);
  }

  /* ── employee incentive rules ──────────────────────────────────────── */
  console.log('▸ Employee incentive rules');
  for (let i = 0; i < SCALE.incentiveRules; i++) {
    if (!employees.length) break;
    // Only offer a basis whose reference pool is non-empty, so we never send a
    // CATEGORY/ITEM/BRAND rule without the referenceId its validator demands.
    const bases = ['ALL_SALES'];
    if (categoryIds.length) bases.push('CATEGORY');
    if (items.length) bases.push('ITEM');
    if (brandIds.length) bases.push('BRAND');
    const basis = pick(bases);
    const ref =
      basis === 'CATEGORY' ? pick(categoryIds)
        : basis === 'ITEM' ? pick(items).id
          : basis === 'BRAND' ? pick(brandIds)
            : undefined;
    await track('incentiveRules', () =>
      empIncentivesSvc.createRule({
        employeeId: pick(employees).id,
        basis,
        referenceId: ref,
        percentage: rf(0.5, 5),
        startsOn: isoDate(daysAgo(90)),
      }));
    progress('incentiveRules', i + 1, SCALE.incentiveRules);
  }

  /* ── cash register sessions + entries ──────────────────────────────── */
  console.log('▸ Cash register');
  for (let d = 0; d < SCALE.cashDays; d++) {
    const date = isoDate(daysAgo(d + 1));
    const opened = await track('cashSessions', () =>
      cashSvc.openSession({ sessionDate: date, actualOpening: rf(10000, 80000) }), /already exists/i);
    if (opened) {
      await track('cashSessions', () =>
        cashSvc.closeSession(date, { actualClosing: rf(10000, 200000) }));
    }
  }
  const CASH_CATS = ['EXPENSE', 'MISC', 'OTHER'];
  for (let i = 0; i < SCALE.cashEntries; i++) {
    await track('cashEntries', () =>
      cashSvc.create({
        direction: pick(['IN', 'OUT']),
        category: pick(CASH_CATS),
        amount: rf(500, 50000),
        accountId: cashAcct,
        description: pick(['Tea & refreshments', 'Fuel', 'Repair tools', 'Misc petty cash', 'Utility bill']),
      }));
    progress('cashEntries', i + 1, SCALE.cashEntries);
  }

  // Authoritative check: query the seed's OWN connection for what actually
  // persisted, before we close it. If these climb but a fresh process later
  // sees fewer rows, the file had a second writer (SQLite is single-writer).
  try {
    const ds: any = ds0;
    const c = async (t: string) => (await ds.query(`SELECT COUNT(*) AS c FROM ${t}`))[0].c;
    console.log('\n📊  Persisted (seed connection):',
      `sales=${await c('sales')}`,
      `purchases=${await c('purchases')}`,
      `stock_movements=${await c('stock_movements')}`,
      `journal_entries=${await c('journal_entries')}`,
      `audit_logs=${await c('audit_logs')}`);
  } catch (e: any) {
    console.log('count check failed:', e?.message);
  }

  await app.close();
  printSummary(t0);
}

function printSummary(t0: number) {
  console.log('\n──────────────── Seed summary ────────────────');
  let ok = 0;
  let fail = 0;
  for (const [phase, t] of Object.entries(tally)) {
    ok += t.ok;
    fail += t.fail;
    const f = t.fail ? `   ✗ ${t.fail} (${t.sample})` : '';
    console.log(`  ${phase.padEnd(18)} ${String(t.ok).padStart(7)}${f}`);
  }
  console.log('───────────────────────────────────────────────');
  console.log(`  TOTAL: ${ok} rows · ${fail} failures · ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
