# ERP System – Phase 1 (Offline-First MVP) + Full Architecture Guide

## Overview
Phase 1 is a fully deployable ERP system for a small shop with **offline-first capability + cloud sync**.

This system supports:
- Inventory management
- Sales & purchase vouchers
- Basic accounting
- Offline usage (no internet required)
- Cloud synchronization when online

---

# 1. Final Tech Stack (Offline-First Architecture)

## 🖥 Desktop Application (Client)
- Electron (Desktop Shell)
- React (UI)
- SQLite (Local Database)

## ☁️ Backend + Cloud
- NestJS (Business Logic API)
- PostgreSQL (via Supabase)
- Supabase (Cloud database hosting)

## 🔄 Sync Layer
- Custom Sync Engine (NestJS + API)
- Event-based synchronization (transaction logs)

---

# 2. System Architecture

## 2.1 Data Flow

Offline Mode:
React UI → SQLite (local DB) → Sync Queue

Online Sync:
SQLite Sync Queue → NestJS API → Supabase PostgreSQL

---

## 2.2 Core Principle

👉 NEVER sync raw tables directly

Instead sync:
- Sales events
- Purchase events
- Payment events
- Stock movements

---

# 3. Development Environment Setup

## 3.1 Required Installations

### Core Tools
- Node.js (LTS)
- Git
- VS Code

### Desktop App
- Electron (via npm)

### Database Tools
- SQLite Viewer (optional)
- DBeaver (for Supabase PostgreSQL)

---

# 4. Supabase Setup (Cloud Layer)

## 4.1 Purpose
Supabase is used ONLY for:
- Central database
- Reporting
- Backup
- Multi-device sync

## 4.2 Important Rule
👉 Supabase is NOT used for offline logic

---

# 5. Backend Setup (NestJS)

## 5.1 Install
```bash
npm install -g @nestjs/cli
nest new erp-backend
```

## 5.2 Dependencies
```bash
npm install @nestjs/config
npm install typeorm pg
```

## 5.3 Core Modules
```bash
nest generate module items
nest generate module customers
nest generate module suppliers
nest generate module sales
nest generate module purchases
nest generate module stock
nest generate module sync
```

---

# 6. Desktop App Setup (Electron + React)

## 6.1 Create React App
```bash
npm create vite@latest erp-desktop
```

## 6.2 Install Electron
```bash
npm install electron
npm install concurrently wait-on
```

## 6.3 Architecture

React UI (Renderer Process)
↓
Electron Main Process
↓
SQLite Local Database

---

# 7. Offline Database (SQLite)

## 7.1 Purpose
- Full ERP works without internet
- Stores all transactions locally
- Sync queue stored here

## 7.2 Local DB Tables
Same structure as cloud but optimized for local use

---

# 8. Sync System (CRITICAL)

## 8.1 Sync Queue Table (Local SQLite)

| Field | Type | Description |
|------|------|-------------|
| id | UUID | Event ID |
| type | TEXT | event type |
| payload | JSON | transaction data |
| status | TEXT | pending/synced/failed |
| created_at | TIMESTAMP | time |

---

## 8.2 Sync Flow

### Step 1: Offline Action
- User creates sale
- Saved in SQLite
- Added to sync_queue

### Step 2: Sync Trigger
- Internet detected
- Sync engine activates

### Step 3: API Push
- Events sent to NestJS API

### Step 4: Server Processing
- Validate stock
- Apply accounting rules
- Store in PostgreSQL

### Step 5: Mark Synced
- Local DB marks event as synced

---

## 8.3 Conflict Handling Rules
- Server is source of truth
- Duplicate event IDs ignored
- Stock validation on server side

---

# 9. Core Modules (Phase 1)

## 9.1 Master Data
- Items
- Brands
- Customers
- Suppliers
- Stores
- Bank/Wallet accounts

## 9.2 Transactions
- Sales Voucher
- Purchase Voucher
- Sale Return
- Purchase Return
- Payment Voucher
- Receipt Voucher

## 9.3 Inventory
- Stock Movement Ledger
- Real-time stock calculation

---

# 10. Database Schema (Cloud - Supabase PostgreSQL)

## 10.1 Items
| Field | Type |
|------|------|
| id | UUID |
| name | TEXT |
| sku | TEXT |
| brand_id | UUID |
| purchase_price | DECIMAL |
| sale_price | DECIMAL |
| unit | TEXT |
| min_stock_level | INTEGER |
| is_active | BOOLEAN |
| created_at | TIMESTAMP |

---

## 10.2 Stock Movements (Critical)
| Field | Type |
|------|------|
| id | UUID |
| item_id | UUID |
| store_id | UUID |
| type | TEXT (IN/OUT) |
| quantity | INTEGER |
| reference_type | TEXT |
| reference_id | UUID |
| created_at | TIMESTAMP |

---

## 10.3 Sales Voucher
| Field | Type |
|------|------|
| id | UUID |
| invoice_no | TEXT |
| customer_id | UUID |
| store_id | UUID |
| total_amount | DECIMAL |
| discount | DECIMAL |
| net_amount | DECIMAL |
| paid_amount | DECIMAL |
| due_amount | DECIMAL |
| payment_method | TEXT |
| created_at | TIMESTAMP |

---

# 11. Business Rules

## Stock Rules
- Purchase → Stock IN
- Sale → Stock OUT
- Return → Reverse movement

## Accounting Rules
- Sale → Customer Debit + Revenue Credit
- Purchase → Inventory Debit + Supplier Credit
- Payment → Cash/Bank Credit + Supplier Debit

---

# 12. API Structure (NestJS)

Modules:
- items
- customers
- suppliers
- sales
- purchases
- stock
- sync

Pattern:
Controller → Service → Repository

---

# 13. Phase 1 Completion Criteria

System is complete when:
- Full offline sales work
- Stock updates correctly offline
- Sync works to cloud
- Invoices print locally
- Server validates synced data
- No data loss during sync

---

# 14. Final Architecture Summary

### Offline Mode
React (Electron UI)
↓
SQLite (Local DB)
↓
Sync Queue

### Online Mode
Sync Queue
↓
NestJS API
↓
Supabase PostgreSQL

---

## 4.3 Supabase Connection String (Environment Safe)

For security reasons, credentials should NOT be hardcoded in your codebase or documentation files.

Use environment variables instead:

```bash
DATABASE_URL=postgresql://postgres:<DB_PASSWORD>@db.vgjecwkyselvwwvmawvn.supabase.co:5432/postgres
```

### Recommended (NestJS .env usage)
```env
DATABASE_URL=postgresql://postgres:<DB_PASSWORD>@db.vgjecwkyselvwwvmawvn.supabase.co:5432/postgres
```

In your NestJS app, access it via:
- process.env.DATABASE_URL

⚠️ Never commit real passwords to Git or documentation.

# End of Phase 1 Offline-First ERP Design

