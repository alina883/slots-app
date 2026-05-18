import { useState, useEffect, useRef } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = "https://cdzanvtkqkyexljvovan.supabase.co";
const SUPABASE_KEY  = "sb_publishable_IgUV3oZYjYrtvkJUa33aEg_5FD9vJ2B";
const FUNCTION_URL  = "https://cdzanvtkqkyexljvovan.supabase.co/functions/v1/google-calendar";
const supabase      = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DATE HELPERS ──────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }
function fmtTime(s) { return `${pad(Math.floor(s/60))}:${pad(s%60)}`; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr, n) {
  const d = new Date(dateStr); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function getWeekDays() {
  // Returns Mon–Sun of the current week as YYYY-MM-DD
  const today = new Date();
  const day   = today.getDay(); // 0=Sun
  const mon   = new Date(today);
  mon.setDate(today.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
function dayLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-GB", { weekday: "short" });
}
function shortDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function nextDueDate(frequency, intervalDays) {
  const today = todayStr();
  if (frequency === "daily")   return addDays(today, 1);
  if (frequency === "weekly")  return addDays(today, 7);
  if (frequency === "monthly") return addDays(today, 30);
  if (frequency === "custom")  return addDays(today, intervalDays || 1);
  return addDays(today, 1);
}

// ── SEQUENCES ─────────────────────────────────────────────────────
const SEQUENCES = {
  laundry: {
    label: "Laundry",
    keywords: ["laundry","wash load","washing machine","tumble dryer","tumble dry","hang to dry","hang washing","fold clothes","put away clothes"],
    singleTask: { name: "Do laundry", slotMinutes: 15, slots: 1 },
    steps: [
      { name: "Sort laundry",                       slotMinutes: 5,  slots: 1 },
      { name: "Load washing machine",               slotMinutes: 5,  slots: 1 },
      { name: "Move to tumble dryer / hang to dry", slotMinutes: 5,  slots: 1 },
      { name: "Start new wash load (if needed)",    slotMinutes: 5,  slots: 1 },
      { name: "Sort dry clothes by person",         slotMinutes: 5,  slots: 1 },
      { name: "Fold clothes",                       slotMinutes: 15, slots: 1 },
      { name: "Put clothes away",                   slotMinutes: 15, slots: 1 },
    ],
  },
  dishwasher: {
    label: "Dishwasher",
    keywords: ["dishwasher","unload dishwasher","load dishwasher","dishwasher on"],
    singleTask: { name: "Do dishwasher", slotMinutes: 5, slots: 1 },
    steps: [
      { name: "Unload clean dishwasher", slotMinutes: 5, slots: 1 },
      { name: "Load dirty dishes",       slotMinutes: 5, slots: 1 },
      { name: "Add tablet & set on",     slotMinutes: 5, slots: 1 },
    ],
  },
  shopping: {
    label: "Food shop",
    keywords: ["food shop","grocery shop","groceries","supermarket","tesco","sainsbury","asda","morrisons","lidl","aldi"],
    singleTask: { name: "Do the food shop", slotMinutes: 15, slots: 2 },
    steps: [
      { name: "Write shopping list", slotMinutes: 5,  slots: 1 },
      { name: "Travel to shop",      slotMinutes: 15, slots: 1 },
      { name: "Do the shop",         slotMinutes: 15, slots: 2 },
      { name: "Travel home",         slotMinutes: 15, slots: 1 },
      { name: "Unpack & put away",   slotMinutes: 15, slots: 1 },
    ],
  },
  cooking: {
    label: "Cook a meal",
    keywords: ["cook dinner","cook lunch","cook breakfast","make dinner","make lunch","make breakfast","prepare meal","cook a meal"],
    singleTask: { name: "Cook dinner", slotMinutes: 15, slots: 2 },
    steps: [
      { name: "Plan what to cook", slotMinutes: 5,  slots: 1 },
      { name: "Prep ingredients",  slotMinutes: 15, slots: 1 },
      { name: "Cook",              slotMinutes: 15, slots: 2 },
      { name: "Serve & eat",       slotMinutes: 15, slots: 1 },
      { name: "Clear up kitchen",  slotMinutes: 15, slots: 1 },
    ],
  },
};

function detectSequence(name) {
  const lower = name.toLowerCase();
  for (const [key, seq] of Object.entries(SEQUENCES)) {
    if (seq.keywords.some(kw => lower.includes(kw))) return { key, seq };
  }
  return null;
}

// ── INTERVAL HOOK ─────────────────────────────────────────────────
function useInterval(cb, delay) {
  const saved = useRef(cb);
  useEffect(() => { saved.current = cb; }, [cb]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ── SWIPEABLE CARD ────────────────────────────────────────────────
function SwipeCard({ onSwipeLeft, onSwipeRight, leftLabel = "🗑 Delete", rightLabel = "📅 Schedule", children }) {
  const startX = useRef(null);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState(null);

  function onTouchStart(e) { startX.current = e.touches[0].clientX; setAction(null); }
  function onTouchMove(e) {
    if (startX.current === null) return;
    const dx = Math.max(-90, Math.min(90, e.touches[0].clientX - startX.current));
    setOffset(dx);
    setAction(dx < -40 ? "left" : dx > 40 ? "right" : null);
  }
  function onTouchEnd() {
    if (action === "left")  onSwipeLeft?.();
    if (action === "right") onSwipeRight?.();
    setOffset(0); setAction(null); startX.current = null;
  }

  return (
    <div style={{ position:"relative", borderRadius:14, overflow:"hidden" }}>
      <div style={{
        position:"absolute", inset:0,
        background: action === "left" ? "var(--red)" : action === "right" ? "var(--purple)" : "transparent",
        display:"flex", alignItems:"center",
        justifyContent: action === "left" ? "flex-end" : "flex-start",
        padding:"0 20px", color:"#fff", fontSize:13, fontWeight:700,
        transition:"background .15s",
      }}>
        {action === "left" && leftLabel}
        {action === "right" && rightLabel}
      </div>
      <div
        style={{ transform:`translateX(${offset}px)`, transition:offset===0?"transform .3s ease":"none", position:"relative" }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#fafaf8;--surface:#f0efea;--border:#e2e0d8;
    --text:#1a1916;--muted:#928f84;
    --red:#d63b2f;--red-dark:#b02e24;--red-light:#fdf1f0;
    --green:#2a7d4f;--green-light:#f0faf4;
    --orange:#c45e1a;--orange-light:#fdf6f0;
    --purple:#5b3fcc;--purple-light:#f3f0fd;
    --radius:14px;
  }
  body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);}
  .app{display:flex;flex-direction:column;min-height:100dvh;max-width:480px;margin:0 auto;}

  /* HEADER */
  .header{padding:14px 20px 10px;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:10;}
  .header-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;}
  .countdown{font-size:30px;font-weight:700;line-height:1;color:var(--red);letter-spacing:-1px;}
  .countdown.urgent{animation:pulse .9s ease-in-out infinite;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  .btn-change{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;color:var(--muted);cursor:pointer;}
  .deadline-picker{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
  .deadline-picker input{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:var(--text);outline:none;}
  .btn-set{background:var(--red);color:#fff;border:none;border-radius:8px;padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;}
  .slots-avail{font-size:11px;color:var(--muted);}
  .slots-avail strong{color:var(--text);}
  .budget-row{display:flex;align-items:center;gap:10px;margin-top:6px;}
  .budget-bar{flex:1;height:4px;background:var(--border);border-radius:99px;overflow:hidden;}
  .budget-fill{height:100%;border-radius:99px;background:var(--red);transition:width .4s ease,background .3s;}
  .budget-fill.over{background:var(--orange);}
  .budget-text{font-size:11px;color:var(--muted);white-space:nowrap;}
  .budget-text strong{color:var(--text);}
  .sync-status{font-size:10px;min-height:13px;}
  .sync-status.ok{color:var(--green);}
  .sync-status.err{color:var(--red);}
  .sync-status.saving{color:var(--orange);}

  /* DAY TABS */
  .day-tabs-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
  .day-tabs-wrap::-webkit-scrollbar{display:none;}
  .day-tabs{display:flex;gap:3px;padding:0 16px 8px;}
  .day-tab{flex-shrink:0;padding:5px 8px;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:#fff;color:var(--muted);transition:all .15s;text-align:center;}
  .day-tab .day-name{display:block;font-size:11px;font-weight:700;}
  .day-tab .day-date{display:block;font-size:9px;opacity:.65;margin-top:1px;}
  .day-tab.today{border-color:var(--red);color:var(--red);}
  .day-tab.active{background:var(--red);color:#fff;border-color:var(--red);}
  .day-tab.active.pool{background:var(--purple);border-color:var(--purple);}
  .day-tab.pool{border-color:var(--purple);color:var(--purple);}
  .day-tab .task-count{display:inline-block;background:rgba(0,0,0,.1);border-radius:99px;font-size:9px;padding:0 4px;margin-left:2px;line-height:1.6;}
  .day-tab.active .task-count{background:rgba(255,255,255,.3);}

  /* TASK LIST */
  .task-list{flex:1;overflow-y:auto;padding:12px 20px;display:flex;flex-direction:column;gap:7px;}
  .section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:6px 0 2px;}
  .task-card{background:#fff;border:1.5px solid var(--border);border-radius:var(--radius);padding:11px 13px;display:flex;align-items:center;gap:10px;transition:border-color .2s,background .2s;}
  .task-card.is-active{border-color:var(--red);background:var(--red-light);}
  .task-card.is-done{border-color:#c8e8d4;opacity:.55;}
  .task-card.is-done .task-name{text-decoration:line-through;color:var(--muted);}
  .task-card.is-partial{border-color:var(--orange);background:var(--orange-light);}
  .task-card.is-recurring{border-left:3px solid var(--green);}
  .task-card.HOME{border-left:4px solid var(--green);}
  .task-card.SELF{border-left:4px solid var(--purple);}
  .task-card.WORK{border-left:4px solid var(--orange);}
  .task-card.ADMIN{border-left:4px solid var(--red);}
  .task-info{flex:1;min-width:0;}
  .task-name-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;}
  .partial-icon{font-size:15px;animation:wobble 2.5s ease-in-out infinite;}
  @keyframes wobble{0%,100%{transform:rotate(0)}20%{transform:rotate(-12deg)}40%{transform:rotate(9deg)}60%{transform:rotate(-5deg)}80%{transform:rotate(3deg)}}
  .task-name{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .recurring-icon{font-size:11px;color:var(--green);flex-shrink:0;}
  .task-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
  .pips{display:flex;gap:3px;flex-wrap:wrap;}
  .pip{width:8px;height:8px;border-radius:2px;background:var(--border);}
  .pip.mini{width:5px;height:5px;}
  .pip.filled{background:var(--red);}
  .pip.open-pip{background:var(--purple);}
  .pip.extra{background:var(--orange);}
  .pip.done-pip{background:var(--green);}
  .pip.partial-pip{background:var(--orange);}
  .meta-label{font-size:10px;color:var(--muted);}
  .partial-time{font-size:10px;color:var(--orange);font-weight:600;}
  .task-right{display:flex;align-items:center;gap:6px;flex-shrink:0;}
  .btn-start{background:var(--red);color:#fff;border:none;border-radius:8px;padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;}
  .btn-start:active{opacity:.8;}
  .active-badge{font-size:10px;color:var(--red);font-weight:700;letter-spacing:.04em;}
  .done-badge{font-size:17px;}
  .empty{text-align:center;color:var(--muted);font-size:13px;padding:48px 20px;line-height:1.9;}
  .swipe-hint{font-size:10px;color:var(--muted);text-align:center;padding:4px 0 8px;letter-spacing:.02em;}

  /* ADD TASK */
  .add-section{padding:10px 20px 16px;border-top:1px solid var(--border);background:var(--bg);}
  .add-row{display:flex;gap:8px;margin-bottom:8px;}
  .input-task{flex:1;background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:11px 13px;color:var(--text);font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:border-color .2s;}
  .input-task:focus{border-color:var(--red);}
  .input-task::placeholder{color:var(--muted);}
  .bucket-row{display:flex;gap:6px;margin-bottom:8px;}
  .bucket-btn{flex:1;padding:7px 4px;border-radius:8px;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid var(--border);background:#fff;color:var(--muted);transition:all .2s;letter-spacing:.05em;}
  .bucket-btn.active.HOME{background:var(--green-light);border-color:var(--green);color:var(--green);}
  .bucket-btn.active.SELF{background:var(--purple-light);border-color:var(--purple);color:var(--purple);}
  .bucket-btn.active.WORK{background:var(--orange-light);border-color:var(--orange);color:var(--orange);}
  .bucket-btn.active.ADMIN{background:var(--red-light);border-color:var(--red);color:var(--red);}
  .slot-controls{display:flex;align-items:center;gap:6px;}
  .slot-toggle{display:flex;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;}
  .slot-toggle-btn{background:none;border:none;padding:8px 11px;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;transition:background .15s,color .15s;}
  .slot-toggle-btn.active{background:var(--red);color:#fff;}
  .slot-stepper{display:flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;}
  .slot-step-btn{background:none;border:none;width:32px;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text);padding:8px 0;}
  .slot-step-btn:active{background:var(--border);}
  .slot-num{font-size:15px;font-weight:700;min-width:22px;text-align:center;color:var(--red);}
  .slot-min{font-size:10px;color:var(--muted);padding-right:8px;}
  .add-btns{display:flex;gap:8px;}
  .btn-add{flex:1;background:var(--red);color:#fff;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:background .2s,transform .1s;}
  .btn-add:active{transform:scale(.98);background:var(--red-dark);}
  .btn-plan{background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:13px 14px;font-size:18px;cursor:pointer;flex-shrink:0;}

  /* SHEETS */
  .sheet-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:160;display:flex;align-items:flex-end;transition:opacity .2s;}
  .sheet-backdrop.hidden{opacity:0;pointer-events:none;}
  .sheet{background:var(--bg);border-radius:20px 20px 0 0;padding:20px 20px 32px;width:100%;max-height:88vh;overflow-y:auto;}
  .sheet-backdrop.hidden .sheet{transform:translateY(40px);}
  .sheet-title{font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:var(--red);margin-bottom:3px;}
  .sheet-sub{font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5;}
  .sheet-actions{display:flex;gap:8px;margin-top:16px;}
  .btn-sheet-cancel{background:var(--surface);border:1px solid var(--border);color:var(--muted);border-radius:10px;padding:12px 14px;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif;}
  .btn-sheet-single{flex:1;background:#fff;border:1.5px solid var(--red);color:var(--red);border-radius:10px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;}
  .btn-sheet-all{flex:1;background:var(--red);color:#fff;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;}
  .seq-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);}
  .seq-item:last-of-type{border-bottom:none;}
  .seq-name{flex:1;font-size:14px;font-weight:500;}
  .seq-time{font-size:11px;color:var(--muted);white-space:nowrap;}

  /* EDIT / SCHEDULE SHEET */
  .modal-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:14px;}
  .modal-input{width:100%;background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--text);font-family:'Inter',sans-serif;font-size:15px;outline:none;margin-bottom:12px;}
  .modal-input:focus{border-color:var(--red);}
  .modal-row{display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap;}
  .modal-label{font-size:12px;color:var(--muted);margin-right:4px;white-space:nowrap;}
  .modal-actions{display:flex;gap:8px;}
  .btn-modal-save{flex:1;background:var(--red);color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;}
  .btn-modal-delete{background:#fdf1f0;color:var(--red);border:1px solid #f5c4c0;border-radius:10px;padding:13px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;}
  .btn-modal-cancel{background:var(--surface);color:var(--muted);border:1px solid var(--border);border-radius:10px;padding:13px 14px;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif;}

  /* DAY PICKER (inside schedule sheet) */
  .day-picker-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;}
  .day-pick-btn{background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:10px 6px;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;text-align:center;transition:all .15s;}
  .day-pick-btn .dp-day{display:block;font-size:13px;font-weight:700;}
  .day-pick-btn .dp-date{display:block;font-size:10px;color:var(--muted);margin-top:2px;}
  .day-pick-btn.selected{background:var(--purple);color:#fff;border-color:var(--purple);}
  .day-pick-btn.selected .dp-date{color:rgba(255,255,255,.7);}
  .day-pick-btn.is-today{border-color:var(--red);}
  .day-pick-btn.pool-pick{background:#fff;border:1.5px solid var(--purple);color:var(--purple);}
  .day-pick-btn.pool-pick.selected{background:var(--purple);color:#fff;}

  /* RECURRING */
  .freq-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;}
  .freq-btn{background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:12px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;text-align:center;transition:all .15s;}
  .freq-btn.active{background:var(--green);color:#fff;border-color:var(--green);}
  .btn-make-recurring{width:100%;background:var(--green);color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;margin-bottom:8px;}
  .btn-skip-recurring{width:100%;background:var(--surface);color:var(--muted);border:1px solid var(--border);border-radius:10px;padding:12px;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif;}
  .custom-interval{display:flex;align-items:center;gap:8px;margin-bottom:14px;}
  .custom-interval input{width:60px;background:#fff;border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:var(--text);outline:none;text-align:center;}
  .custom-interval input:focus{border-color:var(--green);}
  .custom-interval span{font-size:13px;color:var(--muted);}

  /* PLAN MY WEEK */
  .cal-loading{text-align:center;color:var(--muted);font-size:13px;padding:30px 0;}
  .cal-error{background:#fdf1f0;border:1px solid #f5c4c0;border-radius:10px;padding:14px;font-size:13px;color:var(--red);line-height:1.6;margin-bottom:12px;}
  .cal-connect-btn{width:100%;background:var(--red);color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;}
  .cal-bucket-row{display:flex;gap:6px;margin-bottom:14px;}
  .cal-section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:10px 0 6px;}
  .cal-event{margin-bottom:12px;border:1px solid var(--border);border-radius:12px;overflow:hidden;}
  .cal-event-header{padding:10px 14px;background:var(--surface);}
  .cal-event-title{font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px;}
  .cal-event-time{font-size:11px;color:var(--muted);}
  .cal-task-row{display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid var(--border);cursor:pointer;}
  .cal-task-row:active{background:var(--surface);}
  .cal-check{width:18px;height:18px;border-radius:5px;border:2px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;transition:all .15s;}
  .cal-check.on{background:var(--green);border-color:var(--green);color:#fff;}
  .cal-task-name{flex:1;font-size:13px;font-weight:500;}
  .cal-task-time{font-size:11px;color:var(--muted);white-space:nowrap;}
  .btn-add-cal{width:100%;background:var(--green);color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;margin-top:8px;}
  .all-events-list{margin-top:4px;}
  .all-event-row{padding:8px 0;border-bottom:1px solid var(--border);}
  .all-event-row:last-child{border-bottom:none;}
  .all-event-title{font-size:13px;font-weight:600;}
  .all-event-time{font-size:11px;color:var(--muted);}

  /* TIMER */
  .timer-overlay{position:fixed;inset:0;background:var(--bg);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;transition:opacity .3s;}
  .timer-overlay.hidden{opacity:0;pointer-events:none;}
  .timer-task{font-family:'Inter',sans-serif;font-size:20px;font-weight:800;color:var(--red);text-align:center;margin-bottom:4px;}
  .timer-info{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:22px;}
  .ring-wrap{position:relative;width:200px;height:200px;margin-bottom:20px;}
  .ring-wrap svg{transform:rotate(-90deg);width:100%;height:100%;}
  .ring-bg{fill:none;stroke:var(--border);stroke-width:8;}
  .ring-prog{fill:none;stroke:var(--red);stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset 1s linear,stroke .3s;}
  .ring-prog.urgent{stroke:var(--orange);}
  .ring-digits{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;font-size:48px;font-weight:800;letter-spacing:-2px;color:var(--text);}
  .timer-btns{display:flex;gap:10px;width:100%;max-width:320px;margin-bottom:10px;}
  .btn-more{flex:1;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:12px;font-size:12px;cursor:pointer;text-align:center;line-height:1.5;font-family:'Inter',sans-serif;}
  .btn-done{flex:1;background:var(--green);border:none;color:#fff;border-radius:12px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;}
  .btn-interrupt{width:100%;max-width:320px;background:var(--orange-light);border:1.5px solid var(--orange);color:var(--orange);border-radius:12px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:14px;font-family:'Inter',sans-serif;}
  .quick-capture{width:100%;max-width:320px;border-top:1px solid var(--border);padding-top:12px;}
  .quick-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:7px;}
  .quick-row{display:flex;gap:8px;}
  .input-quick{flex:1;background:#fff;border:1.5px solid var(--border);border-radius:9px;padding:10px 12px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;outline:none;}
  .input-quick:focus{border-color:var(--red);}
  .input-quick::placeholder{color:var(--muted);}
  .btn-capture{background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:10px 14px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;}
  .capture-confirm{font-size:12px;color:var(--green);font-weight:600;margin-top:5px;min-height:16px;text-align:center;}

  /* ALARM */
  .alarm-overlay{position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity .2s;}
  .alarm-overlay.hidden{opacity:0;pointer-events:none;}
  .alarm-overlay.visible{animation:alarm-flash .4s ease infinite;}
  @keyframes alarm-flash{0%,100%{background:rgba(214,59,47,.04)}50%{background:rgba(214,59,47,.13)}}
  .alarm-title{font-family:'Inter',sans-serif;font-size:26px;font-weight:800;color:var(--red);text-align:center;}
  .alarm-sub{font-size:13px;color:var(--muted);text-align:center;padding:0 24px;}
  .alarm-btns{display:flex;flex-direction:column;gap:9px;width:280px;}
  .btn-alarm-done{background:var(--green);color:#fff;border:none;border-radius:14px;padding:16px;font-size:16px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;}
  .btn-alarm-more{background:#fff;border:1px solid var(--border);color:var(--text);border-radius:14px;padding:13px;font-size:13px;cursor:pointer;text-align:center;font-family:'Inter',sans-serif;}
  .btn-alarm-interrupt{background:var(--orange-light);border:1.5px solid var(--orange);color:var(--orange);border-radius:14px;padding:13px;font-size:13px;font-weight:600;cursor:pointer;text-align:center;font-family:'Inter',sans-serif;}
  .loading{display:flex;align-items:center;justify-content:center;height:100dvh;font-size:14px;color:var(--muted);}
  .db-error{background:#fdf1f0;border:1px solid #f5c4c0;border-radius:10px;padding:14px 16px;margin:12px 20px;font-size:13px;color:var(--red);line-height:1.5;}
`;

// ── MAIN ──────────────────────────────────────────────────────────
export default function TaskTimer() {
  const weekDays = getWeekDays(); // Mon–Sun as YYYY-MM-DD
  const today    = todayStr();

  // ── STATE ────────────────────────────────────────────────────
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dbError, setDbError]     = useState(null);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncType, setSyncType]   = useState("");

  // Day tab — default to today, or Monday if today is outside this week
  const defaultTab = weekDays.includes(today) ? today : "pool";
  const [activeDay, setActiveDay] = useState(defaultTab);
  const [bucketFilter, setBucketFilter] = useState("ALL"); // ALL | HOME | SELF | WORK | ADMIN

  // Deadline
  const [deadlineH, setDeadlineH] = useState(22);
  const [deadlineM, setDeadlineM] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerVal, setPickerVal]   = useState("22:00");

  // Add task
  const [selectedBucket, setSelectedBucket] = useState("HOME");
  const [taskInput, setTaskInput] = useState("");
  const [slotType, setSlotType]   = useState(15);
  const [newSlots, setNewSlots]   = useState(1);

  // Sheets
  const [seqData, setSeqData]     = useState(null);
  const [editTask, setEditTask]   = useState(null);
  const [editName, setEditName]   = useState("");
  const [editSlotType, setEditSlotType] = useState(15);
  const [editSlots, setEditSlots] = useState(1);

  // Schedule sheet (swipe right from pool)
  const [scheduleTask, setScheduleTask] = useState(null);
  const [scheduleDay, setScheduleDay]   = useState(today);

  // Recurring
  const [recurringPrompt, setRecurringPrompt] = useState(null);
  const [recurFreq, setRecurFreq]   = useState("weekly");
  const [recurInterval, setRecurInterval] = useState(7);

  // Calendar
  const [calendarOpen, setCalendarOpen]     = useState(false);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError]   = useState("");
  const [calBucket, setCalBucket]           = useState("HOME");
  // eventTasks: { [eventId]: [ { name, slotMinutes, slots, whenOffset, checked } ] }
  const [eventTasks, setEventTasks]         = useState({});
  const [customInputs, setCustomInputs]     = useState({}); // { [eventId]: { name, slotMinutes, slots, whenOffset } }
  const [learnedPatterns, setLearnedPatterns] = useState([]);

  // Timer
  const [activeId, setActiveId]   = useState(null);
  const [secsLeft, setSecsLeft]   = useState(0);
  const [totalSecs, setTotalSecs] = useState(0);
  const [alarmOn, setAlarmOn]     = useState(false);
  const alarmRef                  = useRef(null);
  const sessionStartRef           = useRef(null);

  // Daily review / evening recap
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recapOpen, setRecapOpen]   = useState(false);

  // Quick capture
  const [quickInput, setQuickInput] = useState("");
  const [captureMsg, setCaptureMsg] = useState("");

  // Clock
  const [now, setNow] = useState(new Date());
  useInterval(() => setNow(new Date()), 1000);
  useInterval(() => { if (activeId && !alarmOn) setSecsLeft(s => Math.max(0, s - 1)); }, activeId && !alarmOn ? 1000 : null);
  useEffect(() => { if (secsLeft === 0 && activeId && !alarmOn) triggerAlarm(); }, [secsLeft]);

  // ── LOAD ──────────────────────────────────────────────────────
  useEffect(() => { loadTasks(); expireRecurring(); }, []);

  async function loadTasks() {
    setLoading(true);
    const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: true });
    if (error) { setDbError(error.message); setLoading(false); return; }
    setTasks(data || []);
    setLoading(false);
  }

  async function expireRecurring() {
    const { data } = await supabase.from("tasks").select("*").eq("done", false).not("recurring_task_id", "is", null);
    if (!data) return;
    for (const task of data) {
      if (task.due_date && task.due_date < today) {
        await supabase.from("tasks").delete().eq("id", task.id);
        const { data: rec } = await supabase.from("recurring_tasks").select("*").eq("id", task.recurring_task_id).single();
        if (rec) {
          const nextDue = nextDueDate(rec.frequency, rec.interval_days);
          await supabase.from("recurring_tasks").update({ next_due: nextDue }).eq("id", rec.id);
          if (nextDue === today) await spawnRecurringTask(rec, nextDue);
        }
      }
    }
  }

  async function spawnRecurringTask(rec, dueDate) {
    const taskData = { name: rec.name, mode: "deadline", bucket: rec.bucket || "HOME", estimated_slots: 1, slot_minutes: 15, actual_slots: 0, done: false, partial: false, recurring_task_id: rec.id, due_date: dueDate, scheduled_date: dueDate };
    const { data } = await supabase.from("tasks").insert([taskData]).select().single();
    if (data) setTasks(prev => [...prev, data]);
  }

  function showSync(msg, type, duration = 3000) {
    setSyncStatus(msg); setSyncType(type);
    if (duration) setTimeout(() => { setSyncStatus(""); setSyncType(""); }, duration);
  }

  // ── DB ────────────────────────────────────────────────────────
  async function insertTask(taskData) {
    const { data, error } = await supabase.from("tasks").insert([taskData]).select().single();
    if (error) { showSync("Save failed", "err"); return null; }
    return data;
  }
  async function updateTask(id, updates) {
    const { error } = await supabase.from("tasks").update(updates).eq("id", id);
    if (error) { showSync("Update failed", "err"); return false; }
    return true;
  }
  async function deleteTaskDb(id) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { showSync("Delete failed", "err"); return false; }
    return true;
  }
  async function insertSession(taskId, startedAt, endedAt, outcome) {
    await supabase.from("sessions").insert([{ task_id: taskId, started_at: startedAt, ended_at: endedAt, outcome }]);
  }

  // ── DEADLINE ─────────────────────────────────────────────────
  function getDeadline() { const d = new Date(); d.setHours(deadlineH, deadlineM, 0, 0); return d; }
  function applyDeadline() {
    const [h, m] = pickerVal.split(":").map(Number);
    setDeadlineH(h); setDeadlineM(m); setShowPicker(false);
  }
  const deadline     = getDeadline();
  const diffMs       = Math.max(0, deadline - now);
  const diffMins     = diffMs / 60000;
  const slots15      = Math.floor(diffMins / 15);
  const slots5       = Math.floor(diffMins / 5);
  const hh           = Math.floor(diffMs / 3600000);
  const mm           = Math.floor((diffMs % 3600000) / 60000);
  const ss           = Math.floor((diffMs % 60000) / 1000);
  const countdownStr = hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  const urgent       = diffMs < 15 * 60 * 1000 && diffMs > 0;

  // Budget for active day
  const dayTasks   = tasks.filter(t => t.scheduled_date === activeDay && !t.done);
  const usedMins   = dayTasks.reduce((a, t) => a + t.estimated_slots * t.slot_minutes, 0);
  const availMins  = Math.round(diffMins);
  const budgetPct  = availMins > 0 ? Math.min((usedMins / availMins) * 100, 100) : (usedMins > 0 ? 100 : 0);
  const budgetOver = usedMins > availMins;

  // ── ADD TASK ─────────────────────────────────────────────────
  async function addTask(nameOverride, slotsOverride, slotMinsOverride, seqKey, scheduledDate) {
    const name = nameOverride || taskInput.trim();
    if (!name) return;
    if (!nameOverride) {
      const match = detectSequence(name);
      if (match) { setSeqData({ seq: match.seq }); setTaskInput(""); return; }
    }
    showSync("Saving…", "saving", 0);
    const schDate = scheduledDate ?? (activeDay !== "pool" ? activeDay : null);
    const saved = await insertTask({
      name, mode: "deadline", bucket: selectedBucket,
      estimated_slots: slotsOverride ?? newSlots,
      slot_minutes: slotMinsOverride ?? slotType,
      actual_slots: 0, done: false, partial: false,
      sequence_key: seqKey || null,
      scheduled_date: schDate,
    });
    if (saved) { setTasks(prev => [...prev, saved]); showSync("✓ Saved", "ok"); }
    if (!nameOverride) { setTaskInput(""); setNewSlots(1); }
  }

  async function confirmSeqAll() {
    if (!seqData) return;
    const schDate = activeDay !== "pool" ? activeDay : null;
    const inserts = seqData.seq.steps.map(s => ({
      name: s.name, mode: "deadline", bucket: selectedBucket,
      estimated_slots: s.slots, slot_minutes: s.slotMinutes,
      actual_slots: 0, done: false, partial: false,
      sequence_key: "seq", scheduled_date: schDate,
    }));
    const { data, error } = await supabase.from("tasks").insert(inserts).select();
    if (!error && data) { setTasks(prev => [...prev, ...data]); showSync("✓ Saved", "ok"); }
    setSeqData(null);
  }

  async function confirmSeqSingle() {
    if (!seqData) return;
    const s = seqData.seq.singleTask;
    await addTask(s.name, s.slots, s.slotMinutes);
    setSeqData(null);
  }

  // ── SCHEDULE (swipe right) ────────────────────────────────────
  function openSchedule(task) { setScheduleTask(task); setScheduleDay(task.scheduled_date || today); }

  async function saveSchedule() {
    if (!scheduleTask) return;
    const schDate = scheduleDay === "pool" ? null : scheduleDay;
    const ok = await updateTask(scheduleTask.id, { scheduled_date: schDate });
    if (ok) setTasks(prev => prev.map(t => t.id === scheduleTask.id ? { ...t, scheduled_date: schDate } : t));
    setScheduleTask(null);
  }

  // ── EDIT ─────────────────────────────────────────────────────
  function openEdit(task) { setEditTask(task); setEditName(task.name); setEditSlotType(task.slot_minutes); setEditSlots(task.estimated_slots); }

  async function saveEdit() {
    if (!editTask || !editName.trim()) return;
    const updates = { name: editName.trim(), estimated_slots: editSlots, slot_minutes: editSlotType };
    const ok = await updateTask(editTask.id, updates);
    if (ok) setTasks(prev => prev.map(t => t.id === editTask.id ? { ...t, ...updates } : t));
    setEditTask(null);
  }

  async function deleteTask(id) {
    if (activeId === id) stopTimer();
    const ok = await deleteTaskDb(id);
    if (ok) setTasks(prev => prev.filter(t => t.id !== id));
    setEditTask(null);
  }

  // ── QUICK CAPTURE ─────────────────────────────────────────────
  async function quickCapture() {
    const name = quickInput.trim(); if (!name) return;
    const schDate = activeDay !== "pool" ? activeDay : null;
    const saved = await insertTask({ name, mode: "deadline", bucket: selectedBucket, estimated_slots: 1, slot_minutes: 15, actual_slots: 0, done: false, partial: false, scheduled_date: schDate });
    if (saved) { setTasks(prev => [...prev, saved]); setCaptureMsg(`✓ "${name.slice(0,28)}" added`); setTimeout(() => setCaptureMsg(""), 2500); }
    setQuickInput("");
  }

  // ── TIMER ─────────────────────────────────────────────────────
  async function startTask(task) {
    if (activeId) return;
    const slotSecs  = (task.remaining_mins || task.slot_minutes) * 60;
    const newActual = (task.actual_slots || 0) + 1;
    setActiveId(task.id); setSecsLeft(slotSecs); setTotalSecs(slotSecs);
    sessionStartRef.current = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, actual_slots: newActual, partial: false, remaining_mins: null } : t));
    await updateTask(task.id, { actual_slots: newActual, partial: false, remaining_mins: null });
  }

  function stopTimer() { setActiveId(null); setSecsLeft(0); setAlarmOn(false); if (alarmRef.current) { clearInterval(alarmRef.current); alarmRef.current = null; } }

  function triggerAlarm() {
    setAlarmOn(true);
    if (navigator.vibrate) navigator.vibrate([400,200,400,200,400,200,800]);
    playBeep(); alarmRef.current = setInterval(playBeep, 2500);
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 880, 1046].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "square";
        const t = ctx.currentTime + i * .18;
        gain.gain.setValueAtTime(.2, t);
        gain.gain.exponentialRampToValueAtTime(.001, t + .14);
        osc.start(t); osc.stop(t + .15);
      });
    } catch(e) {}
  }

  function stopAlarm() { setAlarmOn(false); if (alarmRef.current) { clearInterval(alarmRef.current); alarmRef.current = null; } if (navigator.vibrate) navigator.vibrate(0); }

  async function addMoreTime() {
    stopAlarm();
    const task = tasks.find(t => t.id === activeId); if (!task) return;
    const newActual = task.actual_slots + 1;
    setSecsLeft(task.slot_minutes * 60); setTotalSecs(task.slot_minutes * 60);
    setTasks(prev => prev.map(t => t.id === activeId ? { ...t, actual_slots: newActual } : t));
    await updateTask(activeId, { actual_slots: newActual });
    await insertSession(activeId, sessionStartRef.current, new Date().toISOString(), "extended");
    sessionStartRef.current = new Date().toISOString();
  }

  async function completeTask() {
    stopAlarm();
    const task = tasks.find(t => t.id === activeId); if (!task) return;
    const nowStr = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === activeId ? { ...t, done: true, partial: false } : t));
    await updateTask(activeId, { done: true, partial: false, completed_at: nowStr });
    await insertSession(activeId, sessionStartRef.current, nowStr, "completed");
    stopTimer();
    if (!task.recurring_task_id) setRecurringPrompt(task);
  }

  async function markInterrupted() {
    stopAlarm();
    const task = tasks.find(t => t.id === activeId); if (!task) return;
    const remaining = Math.max(1, Math.ceil(secsLeft / 60));
    const nowStr    = new Date().toISOString();
    const updated   = { ...task, partial: true, remaining_mins: remaining, done: false };
    setTasks(prev => [...prev.filter(t => t.id !== activeId), updated]);
    await updateTask(activeId, { partial: true, remaining_mins: remaining });
    await insertSession(activeId, sessionStartRef.current, nowStr, "interrupted");
    stopTimer();
  }

  // ── RECURRING ────────────────────────────────────────────────
  async function makeRecurring() {
    if (!recurringPrompt) return;
    const intervalDays = recurFreq === "custom" ? recurInterval : null;
    const nextDue      = nextDueDate(recurFreq, intervalDays);
    const { data: rec, error } = await supabase.from("recurring_tasks").insert([{
      name: recurringPrompt.name, frequency: recurFreq, interval_days: intervalDays, next_due: nextDue, bucket: recurringPrompt.bucket || "HOME",
    }]).select().single();
    if (error) { showSync("Failed", "err"); return; }
    showSync("✓ Added to recurring", "ok");
    setRecurringPrompt(null);
    if (nextDue === today) await spawnRecurringTask(rec, nextDue);
  }

  // ── CALENDAR ─────────────────────────────────────────────────
  // ── SMART EVENT DEFAULTS ────────────────────────────────────────
  const EVENT_DEFAULTS = {
    gym:        [
      { name: "Pack gym bag",    slotMinutes: 5,  slots: 1, whenOffset: -1 },
      { name: "Drive to gym",    slotMinutes: 15, slots: 4, whenOffset: 0  },
      { name: "Shower & change", slotMinutes: 15, slots: 1, whenOffset: 0  },
      { name: "Drive home",      slotMinutes: 15, slots: 4, whenOffset: 0  },
    ],
    seminar:    [
      { name: "Prepare notes",      slotMinutes: 15, slots: 1, whenOffset: -1 },
      { name: "Check joining link", slotMinutes: 5,  slots: 1, whenOffset: -1 },
      { name: "Leave 10 min early", slotMinutes: 5,  slots: 1, whenOffset: 0  },
    ],
    workshop:   [
      { name: "Prepare materials",  slotMinutes: 15, slots: 1, whenOffset: -1 },
      { name: "Leave 10 min early", slotMinutes: 5,  slots: 1, whenOffset: 0  },
    ],
    meeting:    [
      { name: "Prepare agenda",     slotMinutes: 15, slots: 1, whenOffset: 0  },
      { name: "Check connection",   slotMinutes: 5,  slots: 1, whenOffset: 0  },
    ],
    meetup:     [
      { name: "Prepare talking points", slotMinutes: 15, slots: 1, whenOffset: -1 },
      { name: "Travel there",           slotMinutes: 15, slots: 4, whenOffset: 0  },
      { name: "Travel home",            slotMinutes: 15, slots: 4, whenOffset: 0  },
    ],
    founders:   [
      { name: "Prepare talking points", slotMinutes: 15, slots: 1, whenOffset: -1 },
      { name: "Travel there",           slotMinutes: 15, slots: 4, whenOffset: 0  },
      { name: "Travel home",            slotMinutes: 15, slots: 4, whenOffset: 0  },
    ],
    dentist:    [
      { name: "Drive to dentist", slotMinutes: 15, slots: 4, whenOffset: 0 },
      { name: "Drive home",       slotMinutes: 15, slots: 4, whenOffset: 0 },
    ],
    doctor:     [
      { name: "Drive to doctor",  slotMinutes: 15, slots: 4, whenOffset: 0 },
      { name: "Drive home",       slotMinutes: 15, slots: 4, whenOffset: 0 },
    ],
  };

  function getDefaultTasks(eventTitle, learnedPatterns) {
    const lower = eventTitle.toLowerCase();
    // Check learned patterns first
    const learned = learnedPatterns.filter(p => lower.includes(p.event_keyword.toLowerCase()));
    if (learned.length) {
      return learned.map(p => ({ name: p.task_name, slotMinutes: p.slot_minutes, slots: p.slots, whenOffset: p.when_offset, checked: true }));
    }
    // Fall back to built-in defaults
    for (const [keyword, tasks] of Object.entries(EVENT_DEFAULTS)) {
      if (lower.includes(keyword)) return tasks.map(t => ({ ...t, checked: true }));
    }
    return [];
  }

  async function openPlanMyWeek() {
    setCalendarOpen(true); setCalendarLoading(true); setCalendarError("");
    setCalendarEvents([]); setEventTasks({}); setCustomInputs({});
    try {
      // Load learned patterns
      const { data: patterns } = await supabase.from("event_patterns").select("*");
      setLearnedPatterns(patterns || []);

      const res  = await fetch(`${FUNCTION_URL}?action=events`, { headers: { Authorization: `Bearer ${SUPABASE_KEY}` } });
      const data = await res.json();
      if (data.error === "NOT_CONNECTED") { setCalendarError("NOT_CONNECTED"); setCalendarLoading(false); return; }
      if (data.error) throw new Error(data.error);

      const events = data.events || [];
      setCalendarEvents(events);

      // Build task list for every event
      const initial = {};
      const initialInputs = {};
      events.forEach(e => {
        initial[e.id] = getDefaultTasks(e.title, patterns || []);
        initialInputs[e.id] = { name: "", slotMinutes: 15, slots: 1, whenOffset: 0 };
      });
      setEventTasks(initial);
      setCustomInputs(initialInputs);
    } catch(err) { setCalendarError(err.message); }
    setCalendarLoading(false);
  }

  function toggleCalTask(eventId, idx) {
    setEventTasks(prev => ({
      ...prev,
      [eventId]: prev[eventId].map((t, i) => i === idx ? { ...t, checked: !t.checked } : t),
    }));
  }

  function updateCalTaskOffset(eventId, idx, offset) {
    setEventTasks(prev => ({
      ...prev,
      [eventId]: prev[eventId].map((t, i) => i === idx ? { ...t, whenOffset: offset } : t),
    }));
  }

  function addCustomTask(eventId) {
    const input = customInputs[eventId];
    if (!input?.name?.trim()) return;
    const newTask = { name: input.name.trim(), slotMinutes: input.slotMinutes, slots: input.slots, whenOffset: input.whenOffset, checked: true, isCustom: true };
    setEventTasks(prev => ({ ...prev, [eventId]: [...(prev[eventId] || []), newTask] }));
    setCustomInputs(prev => ({ ...prev, [eventId]: { name: "", slotMinutes: 15, slots: 1, whenOffset: 0 } }));
  }

  function updateCustomInput(eventId, field, value) {
    setCustomInputs(prev => ({ ...prev, [eventId]: { ...prev[eventId], [field]: value } }));
  }

  async function addCalendarTasks() {
    const toAdd = [];
    const toLearn = [];

    calendarEvents.forEach(event => {
      const tasks = eventTasks[event.id] || [];
      const eventDate = event.start?.slice(0, 10);

      tasks.filter(t => t.checked).forEach(task => {
        const schDate = eventDate
          ? (task.whenOffset === -1 ? addDays(eventDate, -1) : eventDate)
          : null;
        const finalDate = schDate && weekDays.includes(schDate) ? schDate : schDate;

        toAdd.push({
          name: `${task.name} — ${event.title}`,
          mode: "deadline", bucket: calBucket,
          estimated_slots: task.slots, slot_minutes: task.slotMinutes,
          actual_slots: 0, done: false, partial: false,
          sequence_key: "calendar", scheduled_date: finalDate,
        });

        // Save custom tasks as learned patterns
        if (task.isCustom) {
          const lower = event.title.toLowerCase();
          const keyword = Object.keys(EVENT_DEFAULTS).find(k => lower.includes(k)) || event.title.toLowerCase().split(" ")[0];
          toLearn.push({ event_keyword: keyword, task_name: task.name, slot_minutes: task.slotMinutes, slots: task.slots, when_offset: task.whenOffset });
        }
      });
    });

    // Deduplicate
    const filtered = toAdd.filter(newTask =>
      !tasks.some(ex => ex.name === newTask.name && ex.scheduled_date === newTask.scheduled_date && !ex.done)
    );

    if (!filtered.length && !toLearn.length) { showSync("Already up to date", "ok"); setCalendarOpen(false); return; }

    showSync("Saving…", "saving", 0);

    if (filtered.length) {
      const { data, error } = await supabase.from("tasks").insert(filtered).select();
      if (!error && data) { setTasks(prev => [...prev, ...data]); showSync(`✓ Added ${data.length} tasks`, "ok"); }
      else { showSync("Save failed", "err"); return; }
    }

    // Save learned patterns (avoid duplicates)
    if (toLearn.length) {
      for (const pattern of toLearn) {
        const exists = learnedPatterns.some(p => p.event_keyword === pattern.event_keyword && p.task_name === pattern.task_name);
        if (!exists) await supabase.from("event_patterns").insert([pattern]);
      }
    }

    setCalendarOpen(false);
  }

  function formatEventTime(start, allDay) {
    if (allDay) return "All day";
    const d = new Date(start);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) +
      " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  // ── RENDER HELPERS ────────────────────────────────────────────
  function buildPips(task) {
    const total = Math.max(task.estimated_slots, task.actual_slots || 0);
    return Array.from({ length: total }, (_, i) => {
      let cls = "pip" + (task.slot_minutes === 5 ? " mini" : "");
      if (task.done)                                   cls += " done-pip";
      else if (task.partial && i < task.actual_slots) cls += " partial-pip";
      else if (i >= task.estimated_slots)             cls += " extra";
      else                                             cls += " filled";
      return <div key={i} className={cls} />;
    });
  }

  function buildCard(task) {
    const isActive    = task.id === activeId;
    const isRecurring = !!task.recurring_task_id;
    const isPool      = !task.scheduled_date || !weekDays.includes(task.scheduled_date);
    const cls = ["task-card", task.bucket || "",
      isActive ? "is-active" : task.done ? "is-done" : task.partial ? "is-partial" : "",
      isRecurring ? "is-recurring" : "",
    ].filter(Boolean).join(" ");

    const estMins = task.estimated_slots * task.slot_minutes;
    const actMins = (task.actual_slots || 0) * task.slot_minutes;
    const label   = task.done ? `${estMins}min est · ${actMins}min real` : `${task.estimated_slots} × ${task.slot_minutes}min`;

    const card = (
      <div className={cls}>
        <div className="task-info">
          <div className="task-name-row">
            {task.partial    && <span className="partial-icon">🔄</span>}
            {isRecurring     && <span className="recurring-icon">↻</span>}
            <div className="task-name">{task.name}</div>
          </div>
          <div className="task-meta">
            <div className="pips">{buildPips(task)}</div>
            <span className="meta-label">{label}</span>
            {task.partial && task.remaining_mins && <span className="partial-time">~{task.remaining_mins}min left</span>}
          </div>
        </div>
        <div className="task-right">
          {task.done    ? <span className="done-badge">✓</span>
          : isActive    ? <span className="active-badge">ACTIVE</span>
          : <button className="btn-start" onClick={() => startTask(task)}>{task.partial ? "RESUME" : "START"}</button>}
        </div>
      </div>
    );

    if (task.done || isActive) return <div key={task.id}>{card}</div>;

    return (
      <SwipeCard
        key={task.id}
        onSwipeLeft={() => { if (activeId === task.id) return; deleteTaskDb(task.id).then(ok => ok && setTasks(prev => prev.filter(t => t.id !== task.id))); }}
        onSwipeRight={() => isPool ? openSchedule(task) : openEdit(task)}
        leftLabel="🗑 Delete"
        rightLabel={isPool ? "📅 Schedule" : "✏️ Edit"}
      >
        {card}
      </SwipeCard>
    );
  }

  // Filter tasks for the active tab
  const rawTabTasks = activeDay === "pool"
    ? tasks.filter(t => !t.scheduled_date || !weekDays.includes(t.scheduled_date))
    : tasks.filter(t => t.scheduled_date === activeDay);
  const tabTasks = bucketFilter === "ALL" ? rawTabTasks : rawTabTasks.filter(t => t.bucket === bucketFilter);

  const todo    = tabTasks.filter(t => !t.done && !t.partial);
  const partial = tabTasks.filter(t => t.partial && !t.done);
  const done    = tabTasks.filter(t => t.done);
  const activeTask = tasks.find(t => t.id === activeId);
  const ringOffset = totalSecs > 0 ? 276.46 * (1 - secsLeft / totalSecs) : 0;

  // Task counts per tab for badges
  function tabCount(date) {
    const t = date === "pool"
      ? tasks.filter(t => !t.done && (!t.scheduled_date || !weekDays.includes(t.scheduled_date)))
      : tasks.filter(t => !t.done && t.scheduled_date === date);
    return t.length;
  }

  if (loading) return <><style>{css}</style><div className="loading">Loading…</div></>;

  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* HEADER */}
        <div className="header">
          <div className="header-top">
            <div>
              <div className="deadline-row" style={{display:"flex",alignItems:"center",gap:8}}>
                <div className={`countdown${urgent?" urgent":""}`}>{countdownStr}</div>
                <button className="btn-change" onClick={() => setShowPicker(p => !p)}>change</button>
              </div>
              {showPicker && (
                <div className="deadline-picker">
                  <input type="time" value={pickerVal} onChange={e => setPickerVal(e.target.value)} />
                  <button className="btn-set" onClick={applyDeadline}>Set</button>
                </div>
              )}
              <div className="slots-avail"><strong>{slots15}</strong> × 15min &nbsp;·&nbsp; <strong>{slots5}</strong> × 5min left</div>
            </div>
            <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <div className={`sync-status${syncType ? " "+syncType : ""}`}>{syncStatus || "● Live"}</div>
              <button
                onClick={() => setActiveDay(activeDay==="pool" ? (weekDays.includes(today) ? today : weekDays[0]) : "pool")}
                style={{
                  background: activeDay==="pool" ? "var(--purple)" : "var(--surface)",
                  color: activeDay==="pool" ? "#fff" : "var(--purple)",
                  border: "1.5px solid var(--purple)",
                  borderRadius: 8, padding: "4px 10px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Inter',sans-serif",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                Pool {tabCount("pool") > 0 && <span style={{background:"rgba(0,0,0,.15)",borderRadius:99,fontSize:9,padding:"0 4px"}}>{tabCount("pool")}</span>}
              </button>
            </div>
          </div>
          {activeDay !== "pool" && (
            <div className="budget-row">
              <div className="budget-bar"><div className={`budget-fill${budgetOver?" over":""}`} style={{width:budgetPct+"%"}}/></div>
              <div className="budget-text"><strong>{usedMins}min</strong> · <strong>{availMins}min</strong> left</div>
            </div>
          )}
          {dbError && <div className="db-error">⚠️ {dbError}</div>}
        </div>

        {/* DAY TABS */}
        <div className="day-tabs-wrap">
          <div className="day-tabs">
            {weekDays.map(date => {
              const count   = tabCount(date);
              const isToday = date === today;
              const isActive = date === activeDay;
              return (
                <button
                  key={date}
                  className={`day-tab${isToday?" today":""}${isActive?" active":""}`}
                  onClick={() => setActiveDay(date)}
                >
                  <span className="day-name">{dayLabel(date)}</span>
                  <span className="day-date">{shortDate(date)}</span>
                  {count > 0 && <span className="task-count">{count}</span>}
                </button>
              );
            })}

          </div>
        </div>

        {/* BUCKET FILTER + DAILY REVIEW */}
        <div style={{padding:"8px 16px 0",display:"flex",alignItems:"center",gap:6,justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:4,flex:1,overflowX:"auto"}}>
            {["ALL","HOME","SELF","WORK","ADMIN"].map(b => (
              <button
                key={b}
                onClick={() => setBucketFilter(b)}
                style={{
                  flexShrink:0, padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:700,
                  cursor:"pointer", border:"1.5px solid",
                  background: bucketFilter===b ? (b==="ALL"?"var(--text)":b==="HOME"?"var(--green)":b==="SELF"?"var(--purple)":b==="WORK"?"var(--orange)":"var(--red)") : "#fff",
                  borderColor: b==="ALL"?"var(--border)":b==="HOME"?"var(--green)":b==="SELF"?"var(--purple)":b==="WORK"?"var(--orange)":"var(--red)",
                  color: bucketFilter===b ? "#fff" : (b==="ALL"?"var(--muted)":b==="HOME"?"var(--green)":b==="SELF"?"var(--purple)":b==="WORK"?"var(--orange)":"var(--red)"),
                  fontFamily:"'Inter',sans-serif",
                }}
              >{b}</button>
            ))}
          </div>
          {activeDay === today && (
            <div style={{display:"flex",gap:4,flexShrink:0}}>
              <button onClick={() => setReviewOpen(true)} style={{fontSize:11,fontWeight:700,padding:"4px 9px",borderRadius:6,border:"1px solid var(--border)",background:"#fff",cursor:"pointer",fontFamily:"'Inter',sans-serif",color:"var(--text)"}}>🌅 Review</button>
              <button onClick={() => setRecapOpen(true)}  style={{fontSize:11,fontWeight:700,padding:"4px 9px",borderRadius:6,border:"1px solid var(--border)",background:"#fff",cursor:"pointer",fontFamily:"'Inter',sans-serif",color:"var(--text)"}}>🌙 Recap</button>
            </div>
          )}
        </div>

        {/* TASK LIST */}
        <div className="task-list">
          {tabTasks.length === 0 && (
            <div className="empty">
              {activeDay === "pool" ? "No tasks in the pool.\nAdd tasks below — they'll land here first." : `Nothing scheduled for ${dayLabel(activeDay)} yet.\nAdd a task below or drag from the Pool.`}
            </div>
          )}
          {tabTasks.length > 0 && <div className="swipe-hint">← delete &nbsp;·&nbsp; {activeDay === "pool" ? "schedule →" : "edit →"}</div>}
          {todo.map(buildCard)}
          {partial.length > 0 && <><div className="section-label">⚠️ Unfinished</div>{partial.map(buildCard)}</>}
          {done.length    > 0 && <><div className="section-label">✓ Done</div>{done.map(buildCard)}</>}
        </div>

        {/* ADD TASK */}
        <div className="add-section">
          <div className="bucket-row">
            {["HOME","SELF","WORK","ADMIN"].map(b => (
              <button key={b} className={`bucket-btn${selectedBucket===b?" active "+b:""}`} onClick={() => setSelectedBucket(b)}>{b}</button>
            ))}
          </div>
          <div className="add-row">
            <input className="input-task" value={taskInput} onChange={e => setTaskInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTask()} placeholder="What needs doing?" autoComplete="off"/>
          </div>
          <div className="add-row">
            <div className="slot-controls">
              <div className="slot-toggle">
                <button className={`slot-toggle-btn${slotType===5?" active":""}`}  onClick={() => setSlotType(5)}>5m</button>
                <button className={`slot-toggle-btn${slotType===15?" active":""}`} onClick={() => setSlotType(15)}>15m</button>
              </div>
              <div className="slot-stepper">
                <button className="slot-step-btn" onClick={() => setNewSlots(s => Math.max(1,s-1))}>−</button>
                <span className="slot-num">{newSlots}</span>
                <span className="slot-min">{newSlots*slotType}m</span>
                <button className="slot-step-btn" onClick={() => setNewSlots(s => Math.min(24,s+1))}>+</button>
              </div>
            </div>
          </div>
          <div className="add-btns">
            <button className="btn-add" onClick={() => addTask()}>+ Add Task</button>
            <button className="btn-plan" onClick={openPlanMyWeek} title="Plan my week">📅</button>
          </div>
        </div>

        {/* SCHEDULE SHEET */}
        <div className={`sheet-backdrop${scheduleTask?"":" hidden"}`} onClick={e => e.target===e.currentTarget&&setScheduleTask(null)}>
          <div className="sheet">
            <div className="sheet-title">📅 Schedule task</div>
            <div className="sheet-sub">"{scheduleTask?.name}" — which day?</div>
            <div className="day-picker-grid">
              {weekDays.map(date => (
                <button key={date} className={`day-pick-btn${scheduleDay===date?" selected":""}${date===today?" is-today":""}`} onClick={() => setScheduleDay(date)}>
                  <span className="dp-day">{dayLabel(date)}</span>
                  <span className="dp-date">{shortDate(date)}</span>
                </button>
              ))}
              <button className={`day-pick-btn pool-pick${scheduleDay==="pool"?" selected":""}`} onClick={() => setScheduleDay("pool")}>
                <span className="dp-day">Pool</span>
                <span className="dp-date">no date</span>
              </button>
            </div>
            <div className="sheet-actions">
              <button className="btn-sheet-cancel" onClick={() => setScheduleTask(null)}>Cancel</button>
              <button className="btn-sheet-all" onClick={saveSchedule}>Schedule</button>
            </div>
          </div>
        </div>

        {/* SEQUENCE SHEET */}
        <div className={`sheet-backdrop${seqData?"":" hidden"}`}>
          <div className="sheet">
            <div className="sheet-title">{seqData?.seq.label} — full sequence</div>
            <div className="sheet-sub">These are dependent steps — each one leads to the next.</div>
            {seqData?.seq.steps.map((s, i) => (
              <div key={i} className="seq-item">
                <span className="seq-name">{i+1}. {s.name}</span>
                <span className="seq-time">{s.slots>1?`${s.slots} × `:""}{s.slotMinutes}min</span>
              </div>
            ))}
            <div className="sheet-actions">
              <button className="btn-sheet-cancel" onClick={() => setSeqData(null)}>Cancel</button>
              <button className="btn-sheet-single" onClick={confirmSeqSingle}>Just this task</button>
              <button className="btn-sheet-all"    onClick={confirmSeqAll}>Full sequence</button>
            </div>
          </div>
        </div>

        {/* EDIT SHEET */}
        <div className={`sheet-backdrop${editTask?"":" hidden"}`} onClick={e => e.target===e.currentTarget&&setEditTask(null)}>
          <div className="sheet">
            <div className="modal-title">Edit Task</div>
            <input className="modal-input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Task name"/>
            <div className="modal-row">
              <span className="modal-label">Slots:</span>
              <div className="slot-toggle">
                <button className={`slot-toggle-btn${editSlotType===5?" active":""}`}  onClick={() => setEditSlotType(5)}>5m</button>
                <button className={`slot-toggle-btn${editSlotType===15?" active":""}`} onClick={() => setEditSlotType(15)}>15m</button>
              </div>
              <div className="slot-stepper" style={{marginLeft:4}}>
                <button className="slot-step-btn" onClick={() => setEditSlots(s => Math.max(1,s-1))}>−</button>
                <span className="slot-num">{editSlots}</span>
                <span className="slot-min">{editSlots*editSlotType}m</span>
                <button className="slot-step-btn" onClick={() => setEditSlots(s => Math.min(24,s+1))}>+</button>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-modal-delete" onClick={() => deleteTask(editTask.id)}>Delete</button>
              <button className="btn-modal-cancel" onClick={() => setEditTask(null)}>Cancel</button>
              <button className="btn-modal-save"   onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>

        {/* RECURRING SHEET */}
        <div className={`sheet-backdrop${recurringPrompt?"":" hidden"}`} onClick={e => e.target===e.currentTarget&&setRecurringPrompt(null)}>
          <div className="sheet">
            <div className="sheet-title">Make this recurring?</div>
            <div className="sheet-sub">"{recurringPrompt?.name}" — set a pattern and it'll appear automatically.</div>
            <div className="freq-options">
              {["daily","weekly","monthly","custom"].map(f => (
                <button key={f} className={`freq-btn${recurFreq===f?" active":""}`} onClick={() => setRecurFreq(f)}>
                  {f==="daily"?"Every day":f==="weekly"?"Every week":f==="monthly"?"Every month":"Custom"}
                </button>
              ))}
            </div>
            {recurFreq === "custom" && (
              <div className="custom-interval">
                <span>Every</span>
                <input type="number" min="1" max="365" value={recurInterval} onChange={e => setRecurInterval(Number(e.target.value))}/>
                <span>days</span>
              </div>
            )}
            <button className="btn-make-recurring" onClick={makeRecurring}>↻ Yes, make it recurring</button>
            <button className="btn-skip-recurring" onClick={() => setRecurringPrompt(null)}>No thanks, one-off</button>
          </div>
        </div>

        {/* PLAN MY WEEK SHEET */}
        <div className={`sheet-backdrop${calendarOpen?"":" hidden"}`} onClick={e => e.target===e.currentTarget&&setCalendarOpen(false)}>
          <div className="sheet">
            <div className="sheet-title">📅 Plan my week</div>
            <div className="sheet-sub">Every event is actionable. Tick tasks, set when, add your own.</div>

            {calendarLoading && <div className="cal-loading">Fetching your calendar…</div>}

            {calendarError === "NOT_CONNECTED" && (
              <div>
                <div className="cal-error">Google Calendar isn't connected yet.</div>
                <a href={`${FUNCTION_URL}?action=auth`}>
                  <button className="cal-connect-btn">Connect Google Calendar</button>
                </a>
              </div>
            )}

            {calendarError && calendarError !== "NOT_CONNECTED" && (
              <div className="cal-error">⚠️ {calendarError}</div>
            )}

            {!calendarLoading && !calendarError && (
              <>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"var(--muted)",marginBottom:6}}>Bucket:</div>
                  <div className="cal-bucket-row">
                    {["HOME","SELF","WORK","ADMIN"].map(b => (
                      <button key={b} className={`bucket-btn${calBucket===b?" active "+b:""}`} onClick={() => setCalBucket(b)}>{b}</button>
                    ))}
                  </div>
                </div>

                {calendarEvents.length === 0 && (
                  <div style={{textAlign:"center",color:"var(--muted)",fontSize:13,padding:"30px 0"}}>No events in the next 7 days</div>
                )}

                {calendarEvents.map(event => {
                  const tasks = eventTasks[event.id] || [];
                  const custom = customInputs[event.id] || { name:"", slotMinutes:15, slots:1, whenOffset:0 };
                  const hasChecked = tasks.some(t => t.checked);
                  return (
                    <div key={event.id} className="cal-event" style={{marginBottom:12}}>
                      <div className="cal-event-header">
                        <div className="cal-event-title">{event.title}</div>
                        <div className="cal-event-time">{formatEventTime(event.start, event.allDay)}</div>
                      </div>

                      {/* Suggested + custom tasks */}
                      {tasks.map((task, idx) => (
                        <div key={idx} className="cal-task-row">
                          <div className={`cal-check${task.checked?" on":""}`} onClick={() => toggleCalTask(event.id, idx)}>{task.checked?"✓":""}</div>
                          <span className="cal-task-name" style={{opacity:task.checked?1:.45}}>{task.name}</span>
                          <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                            <button
                              onClick={() => updateCalTaskOffset(event.id, idx, 0)}
                              style={{fontSize:10,padding:"2px 6px",borderRadius:5,border:"1px solid var(--border)",background:task.whenOffset===0?"var(--red)":"#fff",color:task.whenOffset===0?"#fff":"var(--muted)",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:600}}
                            >day of</button>
                            <button
                              onClick={() => updateCalTaskOffset(event.id, idx, -1)}
                              style={{fontSize:10,padding:"2px 6px",borderRadius:5,border:"1px solid var(--border)",background:task.whenOffset===-1?"var(--purple)":"#fff",color:task.whenOffset===-1?"#fff":"var(--muted)",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:600}}
                            >day before</button>
                          </div>
                        </div>
                      ))}

                      {/* Add custom task row */}
                      <div style={{padding:"8px 14px",borderTop:"1px solid var(--border)",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <input
                          value={custom.name}
                          onChange={e => updateCustomInput(event.id, "name", e.target.value)}
                          onKeyDown={e => e.key==="Enter"&&addCustomTask(event.id)}
                          placeholder="+ add your own task…"
                          style={{flex:1,minWidth:120,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:7,padding:"6px 9px",fontSize:12,fontFamily:"'Inter',sans-serif",color:"var(--text)",outline:"none"}}
                        />
                        <select
                          value={custom.slotMinutes}
                          onChange={e => updateCustomInput(event.id, "slotMinutes", Number(e.target.value))}
                          style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:7,padding:"6px 8px",fontSize:12,fontFamily:"'Inter',sans-serif",color:"var(--text)",outline:"none"}}
                        >
                          <option value={5}>5m</option>
                          <option value={15}>15m</option>
                          <option value={30}>30m</option>
                        </select>
                        <select
                          value={custom.whenOffset}
                          onChange={e => updateCustomInput(event.id, "whenOffset", Number(e.target.value))}
                          style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:7,padding:"6px 8px",fontSize:12,fontFamily:"'Inter',sans-serif",color:"var(--text)",outline:"none"}}
                        >
                          <option value={0}>day of</option>
                          <option value={-1}>day before</option>
                        </select>
                        <button
                          onClick={() => addCustomTask(event.id)}
                          style={{background:"var(--red)",color:"#fff",border:"none",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}
                        >Add</button>
                      </div>
                    </div>
                  );
                })}

                {calendarEvents.length > 0 && (
                  <button className="btn-add-cal" onClick={addCalendarTasks}>
                    Add selected tasks to my week
                  </button>
                )}
              </>
            )}

            <div className="sheet-actions" style={{marginTop:12}}>
              <button className="btn-sheet-cancel" onClick={() => setCalendarOpen(false)}>Close</button>
            </div>
          </div>
        </div>

        {/* DAILY REVIEW SHEET */}
        <div className={`sheet-backdrop${reviewOpen?"":" hidden"}`} onClick={e => e.target===e.currentTarget&&setReviewOpen(false)}>
          <div className="sheet">
            <div className="sheet-title">🌅 Daily review</div>
            <div className="sheet-sub">{`Today is ${new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}. Here's what you have.`}</div>

            {/* Slot summary */}
            <div style={{background:"var(--surface)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>⏱ Time available today</div>
              <div style={{fontSize:22,fontWeight:700,color:"var(--red)"}}>{slots15} × 15min slots</div>
              <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{slots5} × 5min slots · {availMins}min total</div>
              {budgetOver && <div style={{fontSize:11,color:"var(--orange)",marginTop:4,fontWeight:600}}>⚠️ You've assigned more time than you have — consider moving some tasks to Pool</div>}
            </div>

            {/* Today's tasks */}
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"var(--muted)",marginBottom:8}}>Scheduled today</div>
            {tasks.filter(t => t.scheduled_date === today && !t.done).length === 0 && (
              <div style={{fontSize:13,color:"var(--muted)",marginBottom:12}}>Nothing scheduled yet — add tasks below or drag from the Pool.</div>
            )}
            {tasks.filter(t => t.scheduled_date === today && !t.done).map(task => (
              <div key={task.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
                <div style={{width:10,height:10,borderRadius:2,background:task.bucket==="HOME"?"var(--green)":task.bucket==="SELF"?"var(--purple)":task.bucket==="WORK"?"var(--orange)":"var(--red)",flexShrink:0}}/>
                <span style={{flex:1,fontSize:13,fontWeight:500}}>{task.name}</span>
                <span style={{fontSize:11,color:"var(--muted)"}}>{task.estimated_slots * task.slot_minutes}min</span>
                <button
                  onClick={async () => { await updateTask(task.id,{scheduled_date:null}); setTasks(prev=>prev.map(t=>t.id===task.id?{...t,scheduled_date:null}:t)); }}
                  style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid var(--border)",background:"#fff",cursor:"pointer",color:"var(--muted)",fontFamily:"'Inter',sans-serif"}}
                >→ Pool</button>
              </div>
            ))}

            <div style={{marginTop:14,display:"flex",gap:8}}>
              <button className="btn-sheet-all" style={{flex:1}} onClick={() => { setShowPicker(true); setReviewOpen(false); }}>Set today's deadline</button>
              <button className="btn-sheet-cancel" onClick={() => setReviewOpen(false)}>Done</button>
            </div>
          </div>
        </div>

        {/* EVENING RECAP SHEET */}
        <div className={`sheet-backdrop${recapOpen?"":" hidden"}`} onClick={e => e.target===e.currentTarget&&setRecapOpen(false)}>
          <div className="sheet">
            <div className="sheet-title">🌙 Evening recap</div>
            <div className="sheet-sub">Here's how today went.</div>

            {(() => {
              const todayDone    = tasks.filter(t => t.scheduled_date === today && t.done);
              const todayLeft    = tasks.filter(t => t.scheduled_date === today && !t.done && !t.partial);
              const todayPartial = tasks.filter(t => t.scheduled_date === today && t.partial);
              const doneMins     = todayDone.reduce((a,t) => a + t.estimated_slots * t.slot_minutes, 0);
              return (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                    <div style={{background:"var(--green-light)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                      <div style={{fontSize:22,fontWeight:700,color:"var(--green)"}}>{todayDone.length}</div>
                      <div style={{fontSize:10,color:"var(--green)",fontWeight:600}}>DONE</div>
                    </div>
                    <div style={{background:"var(--orange-light)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                      <div style={{fontSize:22,fontWeight:700,color:"var(--orange)"}}>{todayPartial.length}</div>
                      <div style={{fontSize:10,color:"var(--orange)",fontWeight:600}}>PARTIAL</div>
                    </div>
                    <div style={{background:"var(--surface)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                      <div style={{fontSize:22,fontWeight:700,color:"var(--muted)"}}>{todayLeft.length}</div>
                      <div style={{fontSize:10,color:"var(--muted)",fontWeight:600}}>LEFT</div>
                    </div>
                  </div>
                  <div style={{fontSize:13,color:"var(--muted)",marginBottom:14}}>You completed <strong style={{color:"var(--text)"}}>{doneMins}min</strong> of work today.</div>

                  {todayLeft.length > 0 && (
                    <>
                      <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"var(--muted)",marginBottom:8}}>Still to do — move to Pool or tomorrow?</div>
                      {todayLeft.map(task => (
                        <div key={task.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                          <span style={{flex:1,fontSize:13}}>{task.name}</span>
                          <button
                            onClick={async () => { const tmr = addDays(today,1); await updateTask(task.id,{scheduled_date:tmr}); setTasks(prev=>prev.map(t=>t.id===task.id?{...t,scheduled_date:tmr}:t)); }}
                            style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid var(--border)",background:"#fff",cursor:"pointer",color:"var(--text)",fontFamily:"'Inter',sans-serif",fontWeight:600}}
                          >Tomorrow</button>
                          <button
                            onClick={async () => { await updateTask(task.id,{scheduled_date:null}); setTasks(prev=>prev.map(t=>t.id===task.id?{...t,scheduled_date:null}:t)); }}
                            style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid var(--border)",background:"#fff",cursor:"pointer",color:"var(--muted)",fontFamily:"'Inter',sans-serif"}}
                          >Pool</button>
                        </div>
                      ))}
                    </>
                  )}
                </>
              );
            })()}

            <div style={{marginTop:16}}>
              <button className="btn-sheet-cancel" style={{width:"100%"}} onClick={() => setRecapOpen(false)}>Close</button>
            </div>
          </div>
        </div>

        {/* TIMER */}
        <div className={`timer-overlay${activeId?"":" hidden"}`}>
          <div className="timer-task">{activeTask?.name}</div>
          <div className="timer-info">slot {activeTask?.actual_slots} · {activeTask?.slot_minutes}min</div>
          <div className="ring-wrap">
            <svg viewBox="0 0 100 100">
              <circle className="ring-bg" cx="50" cy="50" r="44"/>
              <circle className={`ring-prog${secsLeft<60?" urgent":""}`} cx="50" cy="50" r="44" strokeDasharray="276.46" strokeDashoffset={ringOffset}/>
            </svg>
            <div className="ring-digits">{fmtTime(secsLeft)}</div>
          </div>
          <div className="timer-btns">
            <button className="btn-more" onClick={addMoreTime}>+slot<br/><span style={{fontSize:10,color:"#888"}}>need more time</span></button>
            <button className="btn-done" onClick={completeTask}>Done ✓</button>
          </div>
          <button className="btn-interrupt" onClick={markInterrupted}>⚠️ Got interrupted — save progress & come back</button>
          <div className="quick-capture">
            <div className="quick-label">💡 Jot a task — stay focused</div>
            <div className="quick-row">
              <input className="input-quick" value={quickInput} onChange={e => setQuickInput(e.target.value)}
                onKeyDown={e => e.key==="Enter"&&quickCapture()} placeholder="New task to remember…"/>
              <button className="btn-capture" onClick={quickCapture}>Add</button>
            </div>
            {captureMsg && <div className="capture-confirm">{captureMsg}</div>}
          </div>
        </div>

        {/* ALARM */}
        <div className={`alarm-overlay${alarmOn?" visible":" hidden"}`}>
          <div className="alarm-title">⏰ Slot done!</div>
          <div className="alarm-sub">"{activeTask?.name}" — what's the situation?</div>
          <div className="alarm-btns">
            <button className="btn-alarm-done"      onClick={completeTask}>Done ✓</button>
            <button className="btn-alarm-more"      onClick={addMoreTime}>+slot — still going</button>
            <button className="btn-alarm-interrupt" onClick={markInterrupted}>⚠️ Got interrupted</button>
          </div>
        </div>

      </div>
    </>
  );
}
