/**
 * Single source of truth for the domain "hub" structure. Each hub maps a
 * top-level sidebar entry (one per domain — Customer, Supplier, Sales, …)
 * to the set of sub-pages reachable from a horizontal tab strip at the top
 * of those pages.
 *
 * Fields:
 *   - `label`     : sidebar text
 *   - `title`     : page heading rendered above the tab strip (plural form
 *                   of the hub name)
 *   - `subtitle`  : optional short description shown under the title
 *   - `defaultTo` : the route the sidebar entry links to (the first tab)
 *   - `paths`     : every route that belongs to the hub — used to keep
 *                   the sidebar entry highlighted on any sub-page
 *   - `tabs`      : `[{ to, label, icon }]` — tab labels are kept short,
 *                   the hub title above tells the user which domain they're
 *                   in so we don't repeat "Customer …" in each tab.
 */
export const HUBS = {
  customer: {
    label: 'Customer',
    title: 'Customers',
    subtitle: 'Customer info, receipts received, and per-customer ledger.',
    icon: 'user',
    colorVar: '--nav-customer',
    defaultTo: '/customers',
    paths: ['/customers', '/receipts', '/customer-ledger'],
    tabs: [
      { to: '/customers', label: 'Info', icon: 'user' },
      { to: '/receipts', label: 'Receipts', icon: 'card' },
      { to: '/customer-ledger', label: 'Ledger', icon: 'ledger' },
    ],
  },
  sales: {
    label: 'Sales',
    title: 'Sales',
    subtitle: 'Posted invoices and sale returns.',
    icon: 'receipt',
    colorVar: '--nav-sales',
    defaultTo: '/sales',
    paths: ['/sales', '/sale-returns'],
    tabs: [
      { to: '/sales', label: 'History', icon: 'receipt' },
      { to: '/sale-returns', label: 'Returns', icon: 'transfer' },
    ],
  },
  supplier: {
    label: 'Supplier',
    title: 'Suppliers',
    subtitle: 'Supplier info, brands, money out, incentives, and ledger.',
    icon: 'package',
    colorVar: '--nav-supplier',
    defaultTo: '/suppliers',
    paths: ['/suppliers', '/brands', '/payments', '/incentives', '/supplier-ledger'],
    tabs: [
      { to: '/suppliers', label: 'Info', icon: 'package' },
      { to: '/brands', label: 'Brands', icon: 'sparkles' },
      { to: '/payments', label: 'Payments', icon: 'card' },
      { to: '/incentives', label: 'Incentives', icon: 'incentive' },
      { to: '/supplier-ledger', label: 'Ledger', icon: 'ledger' },
    ],
  },
  purchase: {
    label: 'Purchase',
    title: 'Purchases',
    subtitle: 'Orders raised, bills posted, and purchase returns.',
    icon: 'package',
    colorVar: '--nav-purchase',
    defaultTo: '/purchases',
    paths: ['/purchase-orders', '/purchases', '/purchase-returns'],
    tabs: [
      { to: '/purchase-orders', label: 'Orders', icon: 'receipt' },
      { to: '/purchases', label: 'Bills', icon: 'package' },
      { to: '/purchase-returns', label: 'Returns', icon: 'transfer' },
    ],
  },
  item: {
    label: 'Item',
    title: 'Items',
    subtitle: 'Item catalogue and category tree.',
    icon: 'package',
    colorVar: '--nav-item',
    defaultTo: '/items',
    paths: ['/items', '/categories'],
    tabs: [
      { to: '/items', label: 'Catalogue', icon: 'package' },
      { to: '/categories', label: 'Categories', icon: 'master' },
    ],
  },
  stock: {
    label: 'Stock',
    title: 'Stock',
    subtitle: 'On-hand summary, movement history, transfers, and damaged goods.',
    icon: 'stock',
    colorVar: '--nav-stock',
    defaultTo: '/stock',
    paths: ['/stores', '/stock', '/stock-ledger', '/stock-transfers', '/damaged-goods'],
    tabs: [
      { to: '/stock', label: 'Summary', icon: 'stock' },
      { to: '/stores', label: 'Stores', icon: 'store' },
      { to: '/stock-ledger', label: 'Ledger', icon: 'ledger' },
      { to: '/stock-transfers', label: 'Transfers', icon: 'transfer' },
      { to: '/damaged-goods', label: 'Damaged', icon: 'packageX' },
    ],
  },
  employee: {
    label: 'Employee',
    title: 'Employees',
    subtitle: 'Staff roster, attendance, payments, incentive rules, and ledger.',
    icon: 'users',
    colorVar: '--nav-employee',
    defaultTo: '/employees',
    paths: [
      '/employees',
      '/attendance',
      '/employee-payments',
      '/employee-incentive-rules',
      '/employee-ledger',
    ],
    tabs: [
      { to: '/employees', label: 'Info', icon: 'user' },
      { to: '/attendance', label: 'Attendance', icon: 'user' },
      { to: '/employee-payments', label: 'Payments', icon: 'card' },
      { to: '/employee-incentive-rules', label: 'Incentive Rules', icon: 'incentive' },
      { to: '/employee-ledger', label: 'Ledger', icon: 'ledger' },
    ],
  },
  account: {
    label: 'Account',
    title: 'Accounts',
    subtitle: 'Cash, bank, wallet, capital, and credit accounts plus transfers.',
    icon: 'bank',
    colorVar: '--nav-account',
    defaultTo: '/accounts',
    paths: ['/accounts', '/fund-transfers', '/account-ledger'],
    tabs: [
      { to: '/accounts', label: 'Info', icon: 'bank' },
      { to: '/fund-transfers', label: 'Transfers', icon: 'transfer' },
      { to: '/account-ledger', label: 'Ledger', icon: 'ledger' },
    ],
  },
  users: {
    label: 'Users',
    title: 'Users',
    subtitle:
      'User accounts, access requests, sign-in history, and passwords.',
    icon: 'users',
    colorVar: '--nav-users',
    defaultTo: '/users-change-password',
    paths: [
      '/users',
      '/users-allow-access',
      '/users-recent-login',
      '/users-change-password',
    ],
    tabs: [
      // Admin-only tabs come first; the regular-user view starts at
      // Change Password (the only tab visible to them) — `defaultTo`
      // above lands non-admins straight on it. HubFrame filters by role.
      { to: '/users', label: 'Info', icon: 'user', superuserOnly: true },
      {
        to: '/users-allow-access',
        label: 'Allow Access',
        icon: 'shield',
        superuserOnly: true,
      },
      {
        to: '/users-recent-login',
        label: 'Recent Login',
        icon: 'ledger',
        superuserOnly: true,
      },
      { to: '/users-change-password', label: 'Change Password', icon: 'card' },
    ],
  },
  system: {
    label: 'System',
    title: 'System',
    subtitle: 'Backups, audit trail, accent colour, and runtime error log.',
    icon: 'backup',
    colorVar: '--nav-system',
    defaultTo: '/backup',
    paths: ['/backup', '/audit-log', '/error-log', '/accent'],
    tabs: [
      { to: '/backup', label: 'Backups', icon: 'backup' },
      // `superuserOnly` tabs are stripped from the strip in HubFrame for
      // regular users so they don't see (or 403) those pages.
      { to: '/audit-log', label: 'Audit', icon: 'ledger', superuserOnly: true },
      { to: '/error-log', label: 'Errors', icon: 'packageX', superuserOnly: true },
      { to: '/accent', label: 'Accent', icon: 'sparkles' },
    ],
  },
};

/** Flat sidebar list used by `<Layout />`. */
const { system: SYSTEM_HUB, ...HUBS_WITHOUT_SYSTEM } = HUBS;

export const SIDEBAR = [
  { to: '/', label: 'Dashboard', end: true, icon: 'dashboard', colorVar: '--nav-dashboard' },
  { to: '/pos', label: 'POS Terminal', icon: 'pos', colorVar: '--nav-pos' },
  { to: '/cash-register', label: 'Cash Book', icon: 'cash', colorVar: '--nav-cashbook' },
  // Operational hubs (customer / sales / supplier / purchase / item / stock /
  // employee / account)
  ...Object.values(HUBS_WITHOUT_SYSTEM).map((h) => ({
    to: h.defaultTo,
    label: h.label,
    icon: h.icon,
    colorVar: h.colorVar,
    paths: h.paths,
  })),
  // Reports sits between the operational hubs and the admin/system area
  { to: '/financials', label: 'Reports', icon: 'reports', colorVar: '--nav-reports' },
  // System (backups + audit + errors) lives at the bottom — admin/utility area
  {
    to: SYSTEM_HUB.defaultTo,
    label: SYSTEM_HUB.label,
    icon: SYSTEM_HUB.icon,
    colorVar: SYSTEM_HUB.colorVar,
    paths: SYSTEM_HUB.paths,
  },
];
