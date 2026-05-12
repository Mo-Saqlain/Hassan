/* global React, Icon, AppData */
const { ITEMS, TX_HISTORY, Rs } = window.AppData;

// ─── Catalogue hub ───
const MASTER_TILES = [
  { id:"items", icon:"package", c:"#a78bfa", title:"Items", desc:"Model no., brand, categories, pricing.", count:"482 active" },
  { id:"cat", icon:"master", c:"#c084fc", title:"Categories", desc:"Self-referencing tree of product categories.", count:"24 categories" },
  { id:"brand", icon:"sparkles", c:"#f472b6", title:"Brands", desc:"Manufacturer brand list with descriptions.", count:"18 brands" },
  { id:"cust", icon:"user", c:"#34d399", title:"Customers", desc:"Name, contact, opening balance, live A/R.", count:"1,204 customers" },
  { id:"supp", icon:"package", c:"#fbbf24", title:"Suppliers", desc:"Distributor list, A/P side, opening balance.", count:"32 suppliers" },
  { id:"stores", icon:"stock", c:"#fb923c", title:"Stores", desc:"Multi-branch ready. Single store works fine.", count:"1 store" },
  { id:"accounts", icon:"bank", c:"#22d3ee", title:"Accounts", desc:"Cash, Bank, Wallet, Capital, Credit accounts.", count:"7 accounts" },
];
const TX_GROUPS = [
  { name:"Sales", c:"#f472b6", tiles:[
    { id:"sales", icon:"receipt", title:"Sales History", desc:"Read-only POS invoices, payment status, reprint." },
    { id:"sret", icon:"transfer", title:"Sale Returns", desc:"Goods back from customers — stock IN." },
  ]},
  { name:"Purchases", c:"#a78bfa", tiles:[
    { id:"pur", icon:"package", title:"Purchases", desc:"Stock from suppliers — stock IN." },
    { id:"pret", icon:"transfer", title:"Purchase Returns", desc:"Goods returned to suppliers — stock OUT." },
  ]},
  { name:"Money", c:"#22d3ee", tiles:[
    { id:"rct", icon:"receipt", title:"Receipts", desc:"Money in from customers · RCT-…" },
    { id:"pmt", icon:"card", title:"Payments", desc:"Money out to suppliers · PMT-…" },
  ]},
  { name:"Treasury", c:"#2dd4bf", tiles:[
    { id:"trf", icon:"transfer", title:"Fund Transfers", desc:"Move money between your own accounts · TRF-…" },
  ]},
];

const Hub = ({ tiles }) => (
  <div className="grid-4">
    {tiles.map(t => (
      <div className="tile" key={t.id} style={{ "--tile-c": t.c }}>
        <div className="tile-icon"><Icon name={t.icon} size={20}/></div>
        <div>
          <h3>{t.title}</h3>
          <p>{t.desc}</p>
        </div>
        <div className="tile-foot">
          {t.count || "Open"} <Icon name="arrow-right" size={13}/>
        </div>
      </div>
    ))}
  </div>
);

const MasterData = () => (
  <>
    <div className="page-head">
      <div className="page-title">
        <h1>Catalogue</h1>
        <p>Items, categories, brands, parties, stores & accounts.</p>
      </div>
      <button className="btn btn-sm btn-primary"><Icon name="plus" size={14}/> Add item</button>
    </div>
    <Hub tiles={MASTER_TILES}/>
    <div style={{marginTop:30}}>
      <div className="section-head">
        <div><h2>Recently edited</h2><div className="sub">Last touched in the past 7 days</div></div>
        <button className="btn btn-sm btn-ghost">View items <Icon name="chevron" size={13}/></button>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr>
            <th>Model no.</th><th>Brand</th><th>Category</th>
            <th className="num">Price</th><th className="num">On hand</th><th>Status</th>
          </tr></thead>
          <tbody>
            {ITEMS.map(it => (
              <tr key={it.id}>
                <td><div style={{fontWeight:600, color:"var(--text)"}}>{it.model}</div></td>
                <td>{it.brand}</td>
                <td>{it.cat}</td>
                <td className="num">{Rs(it.price)}</td>
                <td className="num">{it.stock}</td>
                <td>{it.stock < it.min
                  ? <span className="chip chip-danger">Low</span>
                  : <span className="chip chip-success">OK</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </>
);

const Transactions = () => (
  <>
    <div className="page-head">
      <div className="page-title">
        <h1>Transactions</h1>
        <p>Sales, purchases, money in/out, treasury transfers.</p>
      </div>
    </div>
    {TX_GROUPS.map(g => (
      <div key={g.name} style={{marginBottom:26}}>
        <div className="section-head">
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <span style={{width:8, height:24, borderRadius:4, background:g.c}}/>
            <h2 style={{fontSize:15, letterSpacing:"0.04em", textTransform:"uppercase"}}>{g.name}</h2>
          </div>
        </div>
        <Hub tiles={g.tiles.map(t => ({...t, c:g.c}))}/>
      </div>
    ))}
  </>
);

// ─── Sales list ───
const Sales = () => (
  <>
    <div className="page-head">
      <div className="page-title">
        <h1>Sales history</h1>
        <p>POS-generated invoices · 2,184 total · 14 today</p>
      </div>
      <div className="row">
        <button className="btn btn-sm"><Icon name="filter" size={14}/> Filter</button>
        <button className="btn btn-sm"><Icon name="download" size={14}/> CSV</button>
        <button className="btn btn-sm"><Icon name="download" size={14}/> PDF</button>
      </div>
    </div>

    <div className="ledger-toolbar">
      <input className="input" placeholder="Search invoice no. or customer…" style={{maxWidth:320}}/>
      <select className="select" style={{maxWidth:160}}><option>All methods</option></select>
      <select className="select" style={{maxWidth:160}}><option>Any status</option></select>
      <span className="chip chip-violet">14 today · Rs 482,300</span>
    </div>

    <div className="table-wrap">
      <table className="t">
        <thead><tr>
          <th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th>
          <th className="num">Amount</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          {[...TX_HISTORY, ...TX_HISTORY].slice(0,9).map((t,i) => (
            <tr key={i}>
              <td style={{fontFamily:"var(--font-mono)", color:"var(--text-muted)"}}>{t.d}</td>
              <td style={{fontFamily:"var(--font-mono)", fontWeight:600, color:"var(--text)"}}>{t.ref}</td>
              <td>{t.party}</td>
              <td><span className="chip">{t.method}</span></td>
              <td className="num">{Rs(t.amt)}</td>
              <td>
                {t.status==="Paid" && <span className="chip chip-success">Paid</span>}
                {t.status==="Partial" && <span className="chip chip-warn">Partial</span>}
                {t.status==="Received" && <span className="chip chip-info">Received</span>}
                {t.status==="Transferred" && <span className="chip chip-violet">Transferred</span>}
              </td>
              <td><button className="btn btn-sm btn-ghost">Reprint</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// ─── Customer Ledger ───
const Ledger = ({ title="Customer Ledger", party="Asad Khan", positive="owes you" }) => (
  <>
    <div className="page-head">
      <div className="page-title">
        <h1>{title}</h1>
        <p>Chronological account history with running balance.</p>
      </div>
      <div className="row">
        <button className="btn btn-sm"><Icon name="download" size={14}/> CSV</button>
        <button className="btn btn-sm"><Icon name="download" size={14}/> PDF</button>
      </div>
    </div>

    <div className="ledger-toolbar">
      <select className="select" style={{maxWidth:280}}><option>{party}</option></select>
      <input className="input" placeholder="From" type="date" style={{maxWidth:160}}/>
      <input className="input" placeholder="To"   type="date" style={{maxWidth:160}}/>
    </div>

    <div className="panel-stripe" style={{marginBottom:18}}>
      <div>
        <div className="label">Opening balance</div>
        <div className="v num">Rs 24,500</div>
      </div>
      <div>
        <div className="label">Current balance · {positive}</div>
        <div className="v num" style={{background:"var(--gradient-primary)", WebkitBackgroundClip:"text", color:"transparent"}}>Rs 96,000</div>
      </div>
    </div>

    <div className="table-wrap">
      <table className="t">
        <thead><tr>
          <th>Date</th><th>Ref</th><th>Description</th>
          <th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th>
        </tr></thead>
        <tbody>
          {[
            { d:"2026-04-30", r:"OPENING", desc:"Brought forward",                deb:0,      cre:0,      bal:24500 },
            { d:"2026-05-02", r:"INV-002180", desc:"Sale · DAWLANCE LVS-15",      deb:148500, cre:0,      bal:173000 },
            { d:"2026-05-04", r:"RCT-000272", desc:"Bank receipt",                deb:0,      cre:100000, bal:73000 },
            { d:"2026-05-08", r:"INV-002182", desc:"Sale · HAIER HRF-336",        deb:96000,  cre:0,      bal:169000 },
            { d:"2026-05-09", r:"SR-000088",  desc:"Return · ORIENT TRENDY-99",   deb:0,      cre:34500,  bal:134500 },
            { d:"2026-05-12", r:"RCT-000284", desc:"Bank receipt",                deb:0,      cre:38500,  bal:96000 },
          ].map((r,i) => (
            <tr key={i}>
              <td style={{fontFamily:"var(--font-mono)", color:"var(--text-muted)"}}>{r.d}</td>
              <td style={{fontFamily:"var(--font-mono)", fontWeight:600}}>{r.r}</td>
              <td>{r.desc}</td>
              <td className="num" style={{color: r.deb ? "var(--text)" : "var(--text-faint)"}}>{r.deb ? Rs(r.deb) : "—"}</td>
              <td className="num" style={{color: r.cre ? "#34d399" : "var(--text-faint)"}}>{r.cre ? Rs(r.cre) : "—"}</td>
              <td className="num" style={{fontWeight:700}}>{Rs(r.bal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

window.Pages2 = { MasterData, Transactions, Sales, Ledger };
