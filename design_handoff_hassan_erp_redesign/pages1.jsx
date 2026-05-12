/* global React, Icon, AppData */
const { useState: useS } = React;
const { ITEMS, TX_HISTORY, Rs } = window.AppData;

// ─── Dashboard ───
const Dashboard = () => (
  <>
    <div className="page-head">
      <div className="page-title">
        <h1>Today at the shop</h1>
        <p>Tuesday, 12 May 2026 · Session open since 09:14</p>
      </div>
      <div className="row">
        <button className="btn btn-sm"><Icon name="download" size={14}/> Export</button>

      </div>
    </div>

    <div className="grid-stat">
      {[
        { label:"Today's sales", value:"482,300", unit:"Rs", delta:"+12.4%", up:true, orb:"var(--gradient-primary)" },
        { label:"Cash in till", value:"86,540",   unit:"Rs", delta:"+8 entries", up:true, orb:"linear-gradient(135deg,#2dd4bf,#06b6d4)" },
        { label:"Items low on stock", value:"7",  unit:"", delta:"3 critical", up:false, orb:"linear-gradient(135deg,#f472b6,#ef4444)" },
        { label:"Adjusted Net Income (MTD)", value:"1.42M", unit:"Rs", delta:"+ Rs 38k incentives", up:true, orb:"linear-gradient(135deg,#a78bfa,#ec4899)" },
      ].map((s,i) => (
        <div className="stat" key={i}>
          <div className="stat-orb" style={{"--stat-orb": s.orb}}/>
          <div className="stat-label">{s.label}</div>
          <div className="stat-value"><span className="unit">{s.unit}</span>{s.value}</div>
          <div className="stat-foot">
            <span className={"delta " + (s.up ? "up" : "down")}>{s.up ? "▲" : "▼"} {s.delta}</span>
            <span>vs yesterday</span>
          </div>
        </div>
      ))}
    </div>

    <div className="grid-2" style={{marginTop: 20}}>
      <div className="card" style={{padding:20}}>
        <div className="section-head">
          <div>
            <h2>Revenue, last 14 days</h2>
            <div className="sub">Net of returns & discounts</div>
          </div>
          <div className="row">
            <button className="btn btn-sm btn-ghost">14d</button>
            <button className="btn btn-sm">30d</button>
            <button className="btn btn-sm btn-ghost">90d</button>
          </div>
        </div>
        <div className="chart">
          <svg viewBox="0 0 600 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.55"/>
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02"/>
              </linearGradient>
              <linearGradient id="ls" x1="0" x2="1">
                <stop offset="0%" stopColor="#a78bfa"/>
                <stop offset="60%" stopColor="#22d3ee"/>
                <stop offset="100%" stopColor="#f472b6"/>
              </linearGradient>
            </defs>
            <path d="M0,170 C40,140 60,160 100,130 C140,100 180,150 220,110 C260,80 300,120 340,90 C380,60 420,130 460,80 C500,40 540,90 600,60 L600,220 L0,220 Z" fill="url(#g1)"/>
            <path d="M0,170 C40,140 60,160 100,130 C140,100 180,150 220,110 C260,80 300,120 340,90 C380,60 420,130 460,80 C500,40 540,90 600,60" stroke="url(#ls)" strokeWidth="2.5" fill="none"/>
            {[0,100,220,340,460,600].map((x,i) => (
              <circle key={i} cx={x} cy={[170,130,110,90,80,60][i]} r="3.5" fill="#0c0e22" stroke="#a78bfa" strokeWidth="2"/>
            ))}
          </svg>
        </div>
      </div>

      <div className="card" style={{padding:20}}>
        <div className="section-head">
          <div><h2>Latest activity</h2><div className="sub">Sales · returns · receipts · transfers</div></div>
          <button className="btn btn-sm btn-ghost">View all <Icon name="chevron" size={13}/></button>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:6}}>
          {TX_HISTORY.slice(0,6).map((t,i) => (
            <div key={i} style={{display:"grid", gridTemplateColumns:"36px 1fr auto auto", gap:12, padding:"10px 4px", alignItems:"center", borderBottom:"1px dashed var(--border)"}}>
              <div style={{width:32,height:32,borderRadius:9,background:"var(--chip-bg)",border:"1px solid var(--border)",display:"grid",placeItems:"center",color:"var(--violet-400)"}}>
                <Icon name={t.kind==="purchase" ? "package" : t.ref.startsWith("RCT") ? "receipt" : t.ref.startsWith("TRF") ? "transfer" : "card"} size={15}/>
              </div>
              <div>
                <div style={{fontSize:13, fontWeight:600}}>{t.party}</div>
                <div style={{fontSize:11, color:"var(--text-muted)", fontFamily:"var(--font-mono)"}}>{t.ref} · {t.method}</div>
              </div>
              <div className="num" style={{fontWeight:600}}>{Rs(t.amt)}</div>
              <span className={"chip " + (t.status==="Paid" ? "chip-success" : t.status==="Partial" ? "chip-warn" : "chip-info")}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="grid-3" style={{marginTop:20}}>
      <div className="card" style={{padding:20}}>
        <div className="eyebrow">Top selling — this month</div>
        <div style={{marginTop:14, display:"flex", flexDirection:"column", gap:10}}>
          {ITEMS.slice(0,4).map((it,i) => (
            <div key={i}>
              <div style={{display:"flex", justifyContent:"space-between", fontSize:12.5, marginBottom:4}}>
                <span style={{fontWeight:600}}>{it.model}</span>
                <span className="num" style={{color:"var(--text-muted)"}}>{18 - i*3} sold</span>
              </div>
              <div style={{height:6, borderRadius:99, background:"var(--chip-bg)", overflow:"hidden"}}>
                <div style={{width:`${100 - i*18}%`, height:"100%", background:"var(--gradient-primary)"}}/>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{padding:20}}>
        <div className="eyebrow">Receivables · Payables</div>
        <div style={{marginTop:14, display:"flex", flexDirection:"column", gap:10}}>
          <div style={{display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px dashed var(--border)"}}>
            <div>
              <div style={{fontSize:11, color:"var(--text-muted)"}}>Owed to you</div>
              <div className="num" style={{fontSize:22, fontWeight:700, color:"#34d399"}}>Rs 312,450</div>
            </div>
            <Icon name="arrow-up" size={20} style={{color:"#34d399"}}/>
          </div>
          <div style={{display:"flex", justifyContent:"space-between", padding:"10px 0"}}>
            <div>
              <div style={{fontSize:11, color:"var(--text-muted)"}}>You owe</div>
              <div className="num" style={{fontSize:22, fontWeight:700, color:"#fda4af"}}>Rs 1,840,000</div>
            </div>
            <Icon name="arrow-down" size={20} style={{color:"#fda4af"}}/>
          </div>
        </div>
      </div>
      <div className="card" style={{padding:20, background:"linear-gradient(160deg, rgba(124,58,237,0.20), rgba(6,182,212,0.10))", borderColor:"var(--border-glow)"}}>
        <div className="eyebrow" style={{color:"#c4b5fd"}}>Incentive · this period</div>
        <h2 style={{marginTop:10, fontSize:18}}>Dawlance Q2 target</h2>
        <div style={{marginTop:8, fontSize:12.5, color:"var(--text-soft)"}}>22 / 40 units sold · Rs 80,000 unlocks at 40</div>
        <div style={{height:8, borderRadius:99, background:"rgba(255,255,255,0.08)", overflow:"hidden", marginTop:14}}>
          <div style={{width:"55%", height:"100%", background:"var(--gradient-accent)"}}/>
        </div>
        <button className="btn btn-sm" style={{marginTop:14}}>View progress <Icon name="arrow-right" size={13}/></button>
      </div>
    </div>
  </>
);

// ─── POS ───
const POS = () => {
  const [method, setMethod] = useS("Cash");
  const [cart] = useS([
    { id:1, model:"DAWLANCE LVS-15", qty:1, price:148500 },
    { id:4, model:"ORIENT TRENDY-99", qty:2, price:34500 },
  ]);
  const sub = cart.reduce((a,c) => a + c.qty * c.price, 0);
  const disc = 4500;
  const total = sub - disc;
  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>POS terminal</h1>
          <p>Session #PS-00481 · open · 14 sales rung up · <span className="num">Rs 462,400</span></p>
        </div>
        <div className="row">
          <span className="chip chip-success"><span style={{width:6,height:6,background:"#10b981",borderRadius:99}}/> Session live</span>
          <button className="btn btn-sm">Close session</button>
        </div>
      </div>

      <div className="pos-grid">
        <div className="card" style={{padding:0, display:"flex", flexDirection:"column"}}>
          <div style={{padding:18, display:"flex", gap:10, borderBottom:"1px solid var(--border)"}}>
            <div style={{flex:1, position:"relative"}}>
              <Icon name="bolt" size={16} style={{position:"absolute", left:14, top:11, color:"var(--violet-400)"}}/>
              <input className="input" placeholder="Type model no. — e.g. DAWLANCE LVS-15" style={{paddingLeft:38, height:46, fontSize:14, fontFamily:"var(--font-mono)"}}/>
            </div>
            <button className="btn btn-lg">
              <Icon name="user" size={16}/> Walk-in customer
            </button>
            <button className="btn btn-lg btn-icon"><Icon name="plus" size={16}/></button>
          </div>

          <div style={{flex:1, overflow:"auto"}}>
            <div className="pos-cart-row" style={{color:"var(--text-muted)", fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600}}>
              <div>Item</div><div>Qty</div><div style={{textAlign:"right"}}>Price</div><div style={{textAlign:"right"}}>Total</div><div></div>
            </div>
            {cart.map(c => (
              <div className="pos-cart-row" key={c.id}>
                <div>
                  <div style={{fontWeight:600, fontSize:13.5}}>{c.model}</div>
                  <div style={{fontSize:11, color:"var(--text-muted)"}}>{c.id===1 ? "Refrigerator · Dawlance" : "Microwave · Orient"}</div>
                </div>
                <div className="qty">
                  <button><Icon name="minus" size={11}/></button>
                  <span className="n">{c.qty}</span>
                  <button><Icon name="plus" size={11}/></button>
                </div>
                <div className="num" style={{textAlign:"right", color:"var(--text-muted)"}}>{Rs(c.price)}</div>
                <div className="num" style={{textAlign:"right", fontWeight:700}}>{Rs(c.qty * c.price)}</div>
                <button className="btn btn-sm btn-ghost btn-icon" style={{height:24, width:24}}><Icon name="x" size={12}/></button>
              </div>
            ))}
          </div>

          <div style={{padding:14, borderTop:"1px solid var(--border)", display:"flex", gap:8, alignItems:"center"}}>
            <button className="btn btn-sm btn-ghost"><Icon name="trash" size={13}/> Clear</button>
            <div style={{flex:1}}/>
            <span style={{fontSize:12, color:"var(--text-muted)"}}>{cart.length} lines · {cart.reduce((a,c)=>a+c.qty,0)} units</span>
          </div>
        </div>

        {/* Payment side */}
        <div className="card" style={{padding:20, display:"flex", flexDirection:"column"}}>
          <h2>Payment</h2>
          <div className="pay-method-grid" style={{marginTop:14}}>
            {[
              { id:"Cash", icon:"cash" },
              { id:"Card", icon:"card" },
              { id:"Bank", icon:"bank" },
              { id:"Credit", icon:"credit" },
            ].map(m => (
              <div key={m.id} className={"pay-method " + (method===m.id?"active":"")} onClick={()=>setMethod(m.id)}>
                <Icon name={m.icon} size={18}/>
                {m.id}
              </div>
            ))}
          </div>

          <div style={{marginTop:18}}>
            <div className="amt-line"><span>Subtotal</span><span className="v">{Rs(sub)}</span></div>
            <div className="amt-line"><span>Discount</span><span className="v" style={{color:"#fda4af"}}>− {Rs(disc)}</span></div>
            <div className="amt-line"><span>Tax</span><span className="v">{Rs(0)}</span></div>
            <div className="amt-line total"><span>Net total</span><span className="v">{Rs(total)}</span></div>
          </div>

          <div style={{marginTop:14}}>
            <div className="eyebrow">Amount paid</div>
            <input className="input" defaultValue={total} style={{marginTop:8, height:46, fontFamily:"var(--font-mono)", fontSize:18, textAlign:"right"}}/>
            <div className="amt-line" style={{marginTop:8}}><span>Change due</span><span className="v" style={{color:"#34d399"}}>{Rs(0)}</span></div>
          </div>

          <div style={{marginTop:"auto", paddingTop:18, display:"flex", flexDirection:"column", gap:10}}>
            <button className="btn btn-primary btn-lg" style={{width:"100%", height:54, fontSize:15}}>
              <Icon name="sparkles" size={16}/> Charge {Rs(total)}
            </button>
            <button className="btn" style={{width:"100%"}}>Park sale</button>
          </div>
        </div>
      </div>
    </>
  );
};

window.Pages1 = { Dashboard, POS };
