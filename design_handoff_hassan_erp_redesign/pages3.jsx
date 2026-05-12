/* global React, Icon, AppData */
const { Rs } = window.AppData;

// ─── Cash Book ───
const CashBook = () => (
  <>
    <div className="page-head">
      <div className="page-title">
        <h1>Cash book — 12 May 2026</h1>
        <p>Session-based daily till · running balance per row</p>
      </div>
      <div className="row">
        <button className="btn btn-sm"><Icon name="download" size={14}/> Export day</button>
        <button className="btn btn-sm">Close session</button>
      </div>
    </div>

    <div className="session-bar" style={{marginBottom:18}}>
      <div className="dot"/>
      <div style={{flex:1}}>
        <div style={{fontSize:13, fontWeight:700}}>Session #CR-00128 · OPEN</div>
        <div style={{fontSize:12, color:"var(--text-soft)"}}>Opened 09:14 · Cashier: Hassan K · Expected opening Rs 61,540 · Actual Rs 61,540 · 0 diff</div>
      </div>
      <span className="chip chip-success">No discrepancies</span>
    </div>

    <div className="grid-4" style={{marginBottom:18}}>
      {[
        { l:"Opening cash", v:"61,540", c:"#a78bfa" },
        { l:"Cash in",      v:"+ 248,300", c:"#34d399" },
        { l:"Cash out",     v:"− 96,200",  c:"#fda4af" },
        { l:"Expected close",v:"213,640", c:"#22d3ee" },
      ].map((s,i) => (
        <div className="stat" key={i}>
          <div className="stat-orb" style={{"--stat-orb": s.c, opacity:0.35}}/>
          <div className="stat-label">{s.l}</div>
          <div className="stat-value"><span className="unit">Rs</span>{s.v}</div>
        </div>
      ))}
    </div>

    <div className="table-wrap">
      <table className="t">
        <thead><tr>
          <th>Time</th><th>Type</th><th>Description</th><th>Ref</th>
          <th className="num">In</th><th className="num">Out</th><th className="num">Balance</th>
        </tr></thead>
        <tbody>
          {[
            { t:"09:14", k:"OPENING", d:"Opening till count", r:"—", i:61540, o:0, b:61540, c:"chip-info" },
            { t:"09:42", k:"TRANSFER", d:"Capital → Cash (cover till)", r:"TRF-000040", i:25000, o:0, b:86540, c:"chip-violet" },
            { t:"10:08", k:"SALE", d:"DAWLANCE LVS-15 · Walk-in", r:"INV-002179", i:148500, o:0, b:235040, c:"chip-success" },
            { t:"11:20", k:"PURCHASE", d:"Bank · Dawlance Dist.", r:"BILL-000412", i:0, o:0, b:235040, c:"" },
            { t:"12:30", k:"EXPENSE", d:"Tea + electricity bill", r:"CR-EXP-021", i:0, o:8200, b:226840, c:"chip-warn" },
            { t:"13:11", k:"SALE", d:"SUPER ASIA SA-260 · Asad Khan", r:"INV-002183", i:42500, o:0, b:269340, c:"chip-success" },
            { t:"13:47", k:"PAYMENT", d:"PEL Distributors", r:"PMT-000111", i:0, o:88000, b:181340, c:"chip-danger" },
            { t:"14:32", k:"SALE", d:"Card · DAWLANCE LVS-15", r:"INV-002184", i:0, o:0, b:181340, c:"" },
          ].map((r,i) => (
            <tr key={i}>
              <td style={{fontFamily:"var(--font-mono)", color:"var(--text-muted)"}}>{r.t}</td>
              <td>{r.c ? <span className={"chip " + r.c}>{r.k}</span> : <span className="chip">{r.k}</span>}</td>
              <td>{r.d}</td>
              <td style={{fontFamily:"var(--font-mono)", color:"var(--text-muted)"}}>{r.r}</td>
              <td className="num" style={{color: r.i ? "#34d399" : "var(--text-faint)"}}>{r.i ? Rs(r.i) : "—"}</td>
              <td className="num" style={{color: r.o ? "#fda4af" : "var(--text-faint)"}}>{r.o ? Rs(r.o) : "—"}</td>
              <td className="num" style={{fontWeight:700}}>{Rs(r.b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// ─── Stock Summary ───
const Stock = () => (
  <>
    <div className="page-head">
      <div className="page-title">
        <h1>Stock summary</h1>
        <p>On-hand vs minimum per item · low-stock alerts highlighted</p>
      </div>
      <div className="row">
        <button className="btn btn-sm"><Icon name="filter" size={14}/> Filter</button>
        <button className="btn btn-sm btn-primary"><Icon name="plus" size={14}/> Adjust stock</button>
      </div>
    </div>

    <div className="grid-4" style={{marginBottom:18}}>
      <div className="stat"><div className="stat-orb" style={{"--stat-orb":"linear-gradient(135deg,#a78bfa,#22d3ee)"}}/>
        <div className="stat-label">Total SKUs</div><div className="stat-value">482</div></div>
      <div className="stat"><div className="stat-orb" style={{"--stat-orb":"#f472b6"}}/>
        <div className="stat-label">Below minimum</div><div className="stat-value" style={{color:"#fda4af"}}>7</div></div>
      <div className="stat"><div className="stat-orb" style={{"--stat-orb":"#34d399"}}/>
        <div className="stat-label">Healthy</div><div className="stat-value">475</div></div>
      <div className="stat"><div className="stat-orb" style={{"--stat-orb":"#22d3ee"}}/>
        <div className="stat-label">Inventory value (cost)</div><div className="stat-value"><span className="unit">Rs</span>14.8M</div></div>
    </div>

    <div className="table-wrap">
      <table className="t">
        <thead><tr><th>Model no.</th><th>Brand</th><th>Category</th><th className="num">On hand</th><th className="num">Min</th><th>Status</th></tr></thead>
        <tbody>
          {window.AppData.ITEMS.map(it => (
            <tr key={it.id}>
              <td style={{fontWeight:600}}>{it.model}</td>
              <td>{it.brand}</td>
              <td>{it.cat}</td>
              <td className="num" style={{fontWeight:700}}>{it.stock}</td>
              <td className="num" style={{color:"var(--text-muted)"}}>{it.min}</td>
              <td>{it.stock < it.min ? <span className="chip chip-danger">Low</span> : <span className="chip chip-success">OK</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// ─── Financials ───
const Financials = () => {
  const [tab, setTab] = React.useState("income");
  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Financial statements</h1>
          <p>1 Apr — 12 May 2026 · incentives applied to adjusted net income</p>
        </div>
        <div className="row">
          <input className="input" type="date" defaultValue="2026-04-01" style={{maxWidth:160}}/>
          <input className="input" type="date" defaultValue="2026-05-12" style={{maxWidth:160}}/>
          <button className="btn btn-sm"><Icon name="download" size={14}/> Export</button>
        </div>
      </div>

      <div className="tabs" style={{marginBottom:18}}>
        {[
          { id:"income", label:"Income Statement" },
          { id:"bs", label:"Balance Sheet" },
          { id:"cf", label:"Cash Flow" },
          { id:"eq", label:"Equity Changes" },
        ].map(t => (
          <div key={t.id} className={"tab " + (tab===t.id?"active":"")} onClick={()=>setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {tab==="income" && (
        <div className="card stmt" style={{padding:"6px 0 14px"}}>
          {[
            { l:"Revenue", g:true },
            { l:"Gross sales",         v:"4,840,200", s:true },
            { l:"Less: discounts",     v:"− 96,500", s:true },
            { l:"Less: sales returns", v:"− 142,000", s:true },
            { l:"Net revenue", v:"4,601,700", sum:true },
            { l:"Cost of goods sold", g:true },
            { l:"Purchases (at cost)",   v:"− 3,148,400", s:true },
            { l:"Returns (at cost)",     v:"+ 102,200", s:true },
            { l:"Gross profit",          v:"1,555,500", sum:true },
            { l:"Operating expenses", g:true },
            { l:"Salaries",   v:"− 220,000", s:true },
            { l:"Utilities",  v:"− 38,400",  s:true },
            { l:"Misc.",      v:"− 12,150",  s:true },
            { l:"Net income", v:"1,284,950", sum:true },
            { l:"Incentives", g:true },
            { l:"Awards received in period", v:"+ 138,000", s:true },
            { l:"Adjusted net income", v:"Rs 1,422,950", final:true },
          ].map((r,i) => (
            <div key={i} className={"stmt-row " + (r.g?"group":"") + (r.s?"sub ":"") + (r.sum?"sum ":"") + (r.final?"final ":"")}>
              <div>{r.l}</div>
              {r.v && <div className="v">{r.v}</div>}
            </div>
          ))}
        </div>
      )}

      {tab==="bs" && (
        <div className="grid-2">
          <div className="card stmt" style={{padding:"6px 0 14px"}}>
            <div className="stmt-row group"><div>Assets</div><div className="v">Rs 18,420,500</div></div>
            <div className="stmt-row sub"><div>Cash on hand</div><div className="v">213,640</div></div>
            <div className="stmt-row sub"><div>Bank balances</div><div className="v">2,840,200</div></div>
            <div className="stmt-row sub"><div>Wallet (Easypaisa)</div><div className="v">62,400</div></div>
            <div className="stmt-row sub"><div>Inventory at cost</div><div className="v">14,790,800</div></div>
            <div className="stmt-row sub"><div>Accounts receivable</div><div className="v">513,460</div></div>
          </div>
          <div className="card stmt" style={{padding:"6px 0 14px"}}>
            <div className="stmt-row group"><div>Liabilities</div><div className="v">Rs 2,180,000</div></div>
            <div className="stmt-row sub"><div>Accounts payable</div><div className="v">1,840,000</div></div>
            <div className="stmt-row sub"><div>Credit payable</div><div className="v">340,000</div></div>
            <div className="stmt-row group"><div>Equity</div><div className="v">Rs 16,240,500</div></div>
            <div className="stmt-row sub"><div>Owner capital contributed</div><div className="v">12,000,000</div></div>
            <div className="stmt-row sub"><div>Retained earnings</div><div className="v">4,240,500</div></div>
          </div>
        </div>
      )}

      {tab==="cf" && (
        <div className="card stmt" style={{padding:"6px 0 14px"}}>
          <div className="stmt-row group"><div>Operating</div><div></div></div>
          <div className="stmt-row sub"><div>Cash receipts from customers</div><div className="v">+ 3,820,400</div></div>
          <div className="stmt-row sub"><div>Cash sales</div><div className="v">+ 1,012,800</div></div>
          <div className="stmt-row sub"><div>Cash paid to suppliers</div><div className="v">− 2,640,200</div></div>
          <div className="stmt-row sub"><div>Operating expenses paid</div><div className="v">− 270,550</div></div>
          <div className="stmt-row sum"><div>Net change in cash</div><div className="v">+ 1,922,450</div></div>
          <div className="stmt-row final"><div>Ending cash</div><div className="v">Rs 3,116,240</div></div>
        </div>
      )}

      {tab==="eq" && (
        <div className="card stmt" style={{padding:"6px 0 14px"}}>
          <div className="stmt-row sub"><div>Opening equity</div><div className="v">15,022,500</div></div>
          <div className="stmt-row sub"><div>(+) Adjusted net income</div><div className="v">+ 1,422,950</div></div>
          <div className="stmt-row sub"><div>(−) Drawings</div><div className="v">− 205,000</div></div>
          <div className="stmt-row final"><div>Closing equity</div><div className="v">Rs 16,240,450</div></div>
        </div>
      )}
    </>
  );
};

window.Pages3 = { CashBook, Stock, Financials };
