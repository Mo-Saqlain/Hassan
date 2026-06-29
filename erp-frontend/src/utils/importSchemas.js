/**
 * Column contracts for the master-data CSV import feature, one per entity.
 *
 * These define the EXACT header names the backend `POST /<path>/import`
 * endpoint reads (see erp-backend/src/modules/<entity>/<entity>.service.ts →
 * `importRows`). They drive three things in the UI:
 *   1. the "Expected columns" hint shown in the import dialog,
 *   2. the downloadable blank template (header row + one example row),
 *   3. nothing is silently renamed — what's listed here is what the API maps.
 *
 * Keep these in lockstep with the backend mappers and the README "CSV import"
 * section. Booleans accept true/false, yes/no, 1/0. Blank cells fall back to
 * the field's default. Auto-generated codes can be left blank.
 */

const ACTIVE = {
  key: 'isActive',
  required: false,
  example: 'true',
  hint: 'true / false (default true)',
};

export const IMPORT_SCHEMAS = {
  customers: {
    label: 'Customers',
    path: '/customers',
    columns: [
      { key: 'code', required: false, example: '', hint: 'blank = auto CUST-000001' },
      { key: 'name', required: true, example: 'Walk-in Customer', hint: 'required' },
      { key: 'phone', required: false, example: '0300-1234567' },
      { key: 'email', required: false, example: 'cust@example.com', hint: 'must be a valid email if present' },
      { key: 'address', required: false, example: 'Shop 4, Main Bazaar' },
      { key: 'openingBalance', required: false, example: '0', hint: 'number ≥ 0; +ve = they owe us' },
      { key: 'creditLimit', required: false, example: '0', hint: 'number ≥ 0' },
      { key: 'creditEnabled', required: false, example: 'false', hint: 'true / false' },
      ACTIVE,
    ],
  },

  suppliers: {
    label: 'Suppliers',
    path: '/suppliers',
    columns: [
      { key: 'code', required: false, example: '', hint: 'blank = auto SUPP-000001' },
      { key: 'name', required: true, example: 'Dawlance Distributor', hint: 'required' },
      { key: 'phone', required: false, example: '042-35000000' },
      { key: 'email', required: false, example: 'sales@distributor.com', hint: 'valid email if present' },
      { key: 'address', required: false, example: 'Industrial Area, Lahore' },
      { key: 'openingBalance', required: false, example: '0', hint: 'number ≥ 0; +ve = we owe them' },
      ACTIVE,
    ],
  },

  items: {
    label: 'Items',
    path: '/items',
    columns: [
      { key: 'modelNo', required: false, example: 'DAWLANCE LVS-15', hint: 'modelNo OR name required' },
      { key: 'name', required: false, example: 'Cable 3m', hint: 'falls back to modelNo' },
      { key: 'sku', required: false, example: '', hint: 'blank = auto-derived from modelNo' },
      { key: 'barcode', required: false, example: '', hint: 'unique if present' },
      { key: 'brand', required: false, example: 'Dawlance', hint: 'existing brand NAME — import brands first' },
      { key: 'categories', required: false, example: 'Refrigerators; Inverter', hint: 'category NAMES, separated by ;' },
      { key: 'purchasePrice', required: false, example: '45000', hint: 'number ≥ 0' },
      { key: 'salePrice', required: false, example: '52000', hint: 'number ≥ 0' },
      { key: 'unit', required: false, example: 'pcs' },
      { key: 'minStockLevel', required: false, example: '2', hint: 'whole number ≥ 0' },
      { key: 'tracksSerials', required: false, example: 'true', hint: 'true / false' },
      { key: 'serialRequiredOnSale', required: false, example: 'true', hint: 'true / false' },
      { key: 'hasWarranty', required: false, example: 'true', hint: 'true / false' },
      { key: 'warrantyType', required: false, example: 'COMPANY', hint: 'COMPANY / SHOP / CHECKING_ONLY / NONE' },
      { key: 'warrantyDays', required: false, example: '365', hint: 'whole number of days' },
      { key: 'isInternalGenerated', required: false, example: 'false', hint: 'true / false (local serials)' },
      ACTIVE,
    ],
  },

  brands: {
    label: 'Brands',
    path: '/brands',
    columns: [
      { key: 'name', required: true, example: 'Dawlance', hint: 'required' },
      { key: 'description', required: false, example: 'Home appliances' },
      ACTIVE,
    ],
  },

  categories: {
    label: 'Categories',
    path: '/categories',
    columns: [
      { key: 'name', required: true, example: 'Refrigerators', hint: 'required' },
      { key: 'code', required: false, example: 'FRIDGE', hint: '≤8 chars, A–Z/0–9; used for local serials' },
      { key: 'description', required: false, example: '' },
      { key: 'parent', required: false, example: '', hint: 'parent category NAME — list parents above children' },
      ACTIVE,
    ],
  },

  stores: {
    label: 'Stores',
    path: '/stores',
    columns: [
      { key: 'name', required: true, example: 'Main Branch', hint: 'required' },
      { key: 'location', required: false, example: 'Main Bazaar' },
      ACTIVE,
    ],
  },

  accounts: {
    label: 'Accounts',
    path: '/accounts',
    columns: [
      { key: 'code', required: false, example: '', hint: 'blank = auto ACC-000001' },
      { key: 'name', required: true, example: 'Cash Till', hint: 'required' },
      { key: 'type', required: true, example: 'CASH', hint: 'CASH / BANK / WALLET / CAPITAL / CREDIT' },
      { key: 'bank', required: false, example: '', hint: 'bank name (for BANK type)' },
      { key: 'accountNumber', required: false, example: '' },
      { key: 'openingBalance', required: false, example: '0', hint: 'number' },
      ACTIVE,
    ],
  },

  purchases: {
    label: 'Purchase Bills',
    path: '/purchases',
    unitLabel: 'bill',
    help: 'Use ONE row per line item. Rows that share a billNo collapse into a single multi-line bill (its supplier / store / payment come from that bill’s first row); a blank billNo makes the row its own auto-numbered bill. Each bill books stock IN, rolls up cost, and posts to the ledger.',
    columns: [
      { key: 'billNo', required: false, example: 'OPENING-001', hint: 'groups rows into one bill; blank = its own auto BILL-…' },
      { key: 'supplier', required: false, example: 'Dawlance Distributor', hint: 'existing supplier NAME (or code)' },
      { key: 'item', required: true, example: 'DAWLANCE LVS-15', hint: 'item SKU / barcode / model no / name' },
      { key: 'store', required: false, example: 'Main Branch', hint: 'store NAME this stock lands in (per line)' },
      { key: 'quantity', required: true, example: '10', hint: 'whole number ≥ 1' },
      { key: 'unitPrice', required: true, example: '45000', hint: 'purchase cost per unit (≥ 0)' },
      { key: 'serials', required: false, example: '', hint: 'optional manufacturer serials, separated by ; (can be left for POS)' },
      { key: 'discount', required: false, example: '0', hint: 'bill-level discount (from first row)' },
      { key: 'paidAmount', required: false, example: '0', hint: 'paid now; rest becomes supplier payable' },
      { key: 'paymentMethod', required: false, example: 'CASH', hint: 'CASH / BANK / etc. (label only)' },
      { key: 'notes', required: false, example: '' },
    ],
  },

  employees: {
    label: 'Employees',
    path: '/employees',
    columns: [
      { key: 'code', required: false, example: '', hint: 'blank = auto EMP-000001' },
      { key: 'name', required: true, example: 'Ali Khan', hint: 'required' },
      { key: 'role', required: false, example: 'Cashier' },
      { key: 'phone', required: false, example: '0301-2223334' },
      { key: 'email', required: false, example: '' },
      { key: 'address', required: false, example: '' },
      { key: 'monthlySalary', required: false, example: '40000', hint: 'number ≥ 0' },
      { key: 'openingBalance', required: false, example: '0', hint: 'number; +ve = we owe them' },
      { key: 'joinedAt', required: false, example: '2024-01-15', hint: 'YYYY-MM-DD' },
      { key: 'salaryDay', required: false, example: '1', hint: '1–31; blank = no auto-accrual' },
      { key: 'firstSalaryInAdvance', required: false, example: 'false', hint: 'true / false' },
      { key: 'notes', required: false, example: '' },
      ACTIVE,
    ],
  },
};
