/* global React, Icon */
const { useState } = React;

// Mock data
const ITEMS = [
  { id:1, model:"DAWLANCE LVS-15", brand:"Dawlance", sku:"DW-LVS-15", cat:"Refrigerators", price:148500, stock:12, min:5 },
  { id:2, model:"PEL PINV-12K", brand:"PEL", sku:"PEL-PINV-12", cat:"Air Conditioners", price:215000, stock:3, min:4 },
  { id:3, model:"HAIER HRF-336", brand:"Haier", sku:"HAR-336", cat:"Refrigerators", price:96000, stock:18, min:6 },
  { id:4, model:"ORIENT TRENDY-99", brand:"Orient", sku:"ORI-T99", cat:"Microwaves", price:34500, stock:24, min:10 },
  { id:5, model:"SUPER ASIA SA-260", brand:"Super Asia", sku:"SA-260", cat:"Washing Machines", price:42500, stock:1, min:3 },
  { id:6, model:"GREE GS-12LMV", brand:"Gree", sku:"GR-12LMV", cat:"Air Conditioners", price:189000, stock:7, min:4 },
];

const TX_HISTORY = [
  { d:"2026-05-12 14:32", ref:"INV-002184", party:"Walk-in", method:"Card",   amt:148500, status:"Paid" },
  { d:"2026-05-12 13:11", ref:"INV-002183", party:"Asad Khan", method:"Cash", amt:42500,  status:"Paid" },
  { d:"2026-05-12 12:47", ref:"INV-002182", party:"Fareed Hashmi", method:"Credit", amt:96000, status:"Partial" },
  { d:"2026-05-12 11:20", ref:"BILL-000412", party:"Dawlance Dist.", method:"Bank", amt:1320000, status:"Paid", kind:"purchase" },
  { d:"2026-05-12 10:08", ref:"RCT-000284",  party:"Imran Traders", method:"Bank", amt:64000,  status:"Received" },
  { d:"2026-05-12 09:42", ref:"TRF-000041",  party:"Capital → Cash", method:"—", amt:25000, status:"Transferred" },
];

const SIDEBAR = [
  { sec:null, items:[
    { id:"dashboard", label:"Dashboard", icon:"dashboard", color:"--nav-dashboard" },
    { id:"pos", label:"POS Terminal", icon:"pos", color:"--nav-pos" },
    { id:"master", label:"Catalogue", icon:"master", color:"--nav-master" },
    { id:"tx", label:"Transactions", icon:"tx", color:"--nav-tx" },
    { id:"cash", label:"Cash Book", icon:"cash", color:"--nav-cash" },
  ]},
  { sec:"Inventory", items:[
    { id:"stock", label:"Stock Summary", icon:"stock", color:"--nav-stock" },
    { id:"stock-ledger", label:"Stock Ledger", icon:"stock", color:"--nav-stock" },
  ]},
  { sec:"Ledgers", items:[
    { id:"cust-ledger", label:"Customer Ledger", icon:"ledger", color:"--nav-ledger" },
    { id:"supp-ledger", label:"Supplier Ledger", icon:"ledger", color:"--nav-ledger" },
  ]},
  { sec:"Reports", items:[
    { id:"financials", label:"Financial Statements", icon:"reports", color:"--nav-reports" },
    { id:"incentives", label:"Incentives", icon:"incentive", color:"--nav-reports" },
  ]},
  { sec:"System", items:[
    { id:"backup", label:"Backups", icon:"backup", color:"--nav-system" },
  ]},
];

// Rs formatter
const Rs = (n, dec=0) => `Rs. ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

// Sidebar
const Sidebar = ({ active, onPick }) => (
  <aside className="sidebar">
    <div className="brand">
      <div className="brand-mark">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M5 4h3v7h8V4h3v16h-3v-7H8v7H5V4z" fill="white"/>
          <path d="M11 16l3-9-1.2 6h2L11 22l1-6h-1z" fill="rgba(255,255,255,0.85)"/>
        </svg>
      </div>
      <div>
        <div className="brand-name">Hassan</div>
        <div className="brand-sub">Home Appliances · ERP</div>
      </div>
    </div>
    {SIDEBAR.map((g, i) => (
      <div className="nav-section" key={i}>
        {g.sec && <div className="nav-section-label">{g.sec}</div>}
        {g.items.map(it => (
          <div key={it.id}
               className={"nav-item " + (active === it.id ? "active" : "")}
               style={{ "--nav-c": `var(${it.color})` }}
               onClick={() => onPick(it.id)}>
            <div className="nav-icon"><Icon name={it.icon} size={15} /></div>
            <span>{it.label}</span>
          </div>
        ))}
      </div>
    ))}
    <div className="sidebar-foot">
      <div style={{width:32,height:32,borderRadius:10,background:"var(--gradient-accent)",display:"grid",placeItems:"center",fontSize:12,fontWeight:700,color:"white"}}>HK</div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:12.5, fontWeight:600, color:"var(--text)"}}>Hassan Khan</div>
        <div style={{fontSize:11, color:"var(--text-muted)"}}>Owner · Shop #1</div>
      </div>
    </div>
  </aside>
);

// Topbar
const Topbar = ({ crumbs, theme, setTheme, onMenu }) => (
  <header className="topbar">
    <button className="mobile-menu-btn" onClick={onMenu}><Icon name="menu" size={18}/></button>
    <div className="crumbs">
      <span>Hassan Electronics</span>
      <Icon name="chevron" size={13}/>
      <span className="cur">{crumbs}</span>
    </div>
    <div className="search" style={{marginLeft: 20}}>
      <Icon name="search" size={15}/>
      <input className="input" placeholder="Search items, customers, vouchers…" />
    </div>
    <div className="spacer"></div>
    <span className="kbd">⌘K</span>
    <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme">
      <Icon name={theme === "dark" ? "sun" : "moon"} size={16}/>
    </button>

  </header>
);

window.AppData = { ITEMS, TX_HISTORY, SIDEBAR, Rs };
window.AppShell = { Sidebar, Topbar };
