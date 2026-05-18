import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── SUPABASE ──────────────────────────────────────────────────────
const SUPABASE_URL  = "https://cdzanvtkqkyexljvovan.supabase.co";
const SUPABASE_KEY  = "sb_publishable_IgUV3oZYjYrtvkJUa33aEg_5FD9vJ2B";
const supabase      = createClient(SUPABASE_URL, SUPABASE_KEY);

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
      { name: "Plan what to cook",  slotMinutes: 5,  slots: 1 },
      { name: "Prep ingredients",   slotMinutes: 15, slots: 1 },
      { name: "Cook",               slotMinutes: 15, slots: 2 },
      { name: "Serve & eat",        slotMinutes: 15, slots: 1 },
      { name: "Clear up kitchen",   slotMinutes: 15, slots: 1 },
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

// ── HELPERS ───────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }
function fmtTime(secs) { return `${pad(Math.floor(secs/60))}:${pad(secs%60)}`; }

function useInterval(cb, delay) {
  const saved = useRef(cb);
  useEffect(() => { saved.current = cb; }, [cb]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ── CSS ───────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');

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
  body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);}

  .app{display:flex;flex-direction:column;min-height:100dvh;max-width:480px;margin:0 auto;}

  /* HEADER */
  .header{padding:16px 20px 12px;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:10;}
  .header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;}
  .mode-tabs{display:flex;gap:6px;margin-bottom:8px;}
  .mode-tab{padding:4px 14px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--muted);transition:all .15s;}
  .mode-tab.deadline{background:var(--red);color:#fff;border-color:var(--red);}
  .mode-tab.open{background:var(--purple);color:#fff;border-color:var(--purple);}

  .deadline-row{display:flex;align-items:center;gap:8px;}
  .countdown{font-family:'Syne',sans-serif;font-size:36px;font-weight:800;line-height:1;color:var(--red);}
  .countdown.open{color:var(--purple);font-size:20px;font-weight:700;}
  .countdown.urgent{animation:pulse .9s ease-in-out infinite;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  .btn-change{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;color:var(--muted);cursor:pointer;white-space:nowrap;}

  .deadline-picker{display:flex;align-items:center;gap:8px;margin-top:6px;}
  .deadline-picker input{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:var(--text);outline:none;}
  .btn-set{background:var(--red);color:#fff;border:none;border-radius:8px;padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;}

  .slots-avail{font-size:11px;color:var(--muted);margin-top:3px;}
  .slots-avail strong{color:var(--text);}

  .budget-row{display:flex;align-items:center;gap:10px;}
  .budget-bar{flex:1;height:5px;background:var(--border);border-radius:99px;overflow:hidden;}
  .budget-fill{height:100%;border-radius:99px;background:var(--red);transition:width .4s ease,background .3s;}
  .budget-fill.over{background:var(--orange);}
  .budget-fill.open-fill{background:var(--purple);}
  .budget-text{font-size:11px;color:var(--muted);white-space:nowrap;}
  .budget-text strong{color:var(--text);}

  .drive-btns{display:flex;gap:5px;flex-shrink:0;}
  .btn-drive{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:11px;font-weight:600;color:var(--muted);cursor:pointer;white-space:nowrap;font-family:'DM Sans',sans-serif;}
  .btn-drive:active{background:var(--border);}
  .sync-status{font-size:10px;color:var(--muted);margin-top:2px;text-align:right;min-height:13px;}
  .sync-status.ok{color:var(--green);}
  .sync-status.err{color:var(--red);}
  .sync-status.saving{color:var(--orange);}

  /* TASK LIST */
  .task-list{flex:1;overflow-y:auto;padding:12px 20px;display:flex;flex-direction:column;gap:7px;}
  .section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:6px 0 2px;}

  .task-card{background:#fff;border:1.5px solid var(--border);border-radius:var(--radius);padding:11px 13px;display:flex;align-items:center;gap:10px;transition:border-color .2s,background .2s;}
  .task-card.is-active{border-color:var(--red);background:var(--red-light);}
  .task-card.is-done{border-color:#c8e8d4;opacity:.55;}
  .task-card.is-done .task-name{text-decoration:line-through;color:var(--muted);}
  .task-card.is-partial{border-color:var(--orange);background:var(--orange-light);}
  .task-card.is-open{border-color:#cfc6f7;}

  .task-info{flex:1;min-width:0;}
  .task-name-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;}
  .partial-icon{font-size:15px;animation:wobble 2.5s ease-in-out infinite;}
  @keyframes wobble{0%,100%{transform:rotate(0)}20%{transform:rotate(-12deg)}40%{transform:rotate(9deg)}60%{transform:rotate(-5deg)}80%{transform:rotate(3deg)}}
  .task-name{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
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
  .btn-start{background:var(--red);color:#fff;border:none;border-radius:8px;padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;}
  .btn-start.open{background:var(--purple);}
  .btn-start:active{opacity:.8;}
  .btn-edit{background:none;border:1px solid var(--border);border-radius:7px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;flex-shrink:0;}
  .btn-edit:active{background:var(--surface);}
  .active-badge{font-size:10px;color:var(--red);font-weight:700;letter-spacing:.04em;}
  .done-badge{font-size:17px;}
  .empty{text-align:center;color:var(--muted);font-size:13px;padding:48px 20px;line-height:1.9;}

  /* ADD TASK */
  .add-section{padding:10px 20px 16px;border-top:1px solid var(--border);background:var(--bg);}
  .add-row{display:flex;gap:8px;margin-bottom:8px;}
  .input-task{flex:1;background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:11px 13px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .2s;}
  .input-task:focus{border-color:var(--red);}
  .input-task::placeholder{color:var(--muted);}
  .slot-controls{display:flex;align-items:center;gap:6px;}
  .slot-toggle{display:flex;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;}
  .slot-toggle-btn{background:none;border:none;padding:8px 11px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;transition:background .15s,color .15s;}
  .slot-toggle-btn.active{background:var(--red);color:#fff;}
  .slot-stepper{display:flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;}
  .slot-step-btn{background:none;border:none;width:32px;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text);padding:8px 0;}
  .slot-step-btn:active{background:var(--border);}
  .slot-num{font-size:15px;font-weight:700;min-width:22px;text-align:center;color:var(--red);}
  .slot-min{font-size:10px;color:var(--muted);padding-right:8px;}
  .btn-add{width:100%;background:var(--red);color:#fff;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;transition:background .2s,transform .1s;}
  .btn-add:active{transform:scale(.98);background:var(--red-dark);}
  .btn-add.open{background:var(--purple);}

  /* SEQUENCE SHEET */
  .sheet-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:160;display:flex;align-items:flex-end;transition:opacity .2s;}
  .sheet-backdrop.hidden{opacity:0;pointer-events:none;}
  .sheet{background:var(--bg);border-radius:20px 20px 0 0;padding:20px 20px 32px;width:100%;transform:translateY(0);transition:transform .25s ease;max-height:80vh;overflow-y:auto;}
  .sheet-backdrop.hidden .sheet{transform:translateY(40px);}
  .sheet-title{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--red);margin-bottom:3px;}
  .sheet-sub{font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5;}
  .seq-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);}
  .seq-item:last-of-type{border-bottom:none;}
  .seq-name{flex:1;font-size:14px;font-weight:500;}
  .seq-time{font-size:11px;color:var(--muted);white-space:nowrap;}
  .sheet-actions{display:flex;gap:8px;margin-top:16px;}
  .btn-sheet-cancel{background:var(--surface);border:1px solid var(--border);color:var(--muted);border-radius:10px;padding:12px 14px;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;}
  .btn-sheet-single{flex:1;background:#fff;border:1.5px solid var(--red);color:var(--red);border-radius:10px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}
  .btn-sheet-all{flex:1;background:var(--red);color:#fff;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;}

  /* EDIT SHEET */
  .modal-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:14px;}
  .modal-input{width:100%;background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:15px;outline:none;margin-bottom:12px;}
  .modal-input:focus{border-color:var(--red);}
  .modal-row{display:flex;gap:8px;margin-bottom:14px;align-items:center;}
  .modal-label{font-size:12px;color:var(--muted);margin-right:4px;}
  .modal-actions{display:flex;gap:8px;}
  .btn-modal-save{flex:1;background:var(--red);color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;}
  .btn-modal-delete{background:#fdf1f0;color:var(--red);border:1px solid #f5c4c0;border-radius:10px;padding:13px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}
  .btn-modal-cancel{background:var(--surface);color:var(--muted);border:1px solid var(--border);border-radius:10px;padding:13px 14px;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;}

  /* TIMER OVERLAY */
  .timer-overlay{position:fixed;inset:0;background:var(--bg);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;transition:opacity .3s;}
  .timer-overlay.hidden{opacity:0;pointer-events:none;}
  .timer-task{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--red);text-align:center;margin-bottom:4px;}
  .timer-task.open{color:var(--purple);}
  .timer-info{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:22px;}
  .ring-wrap{position:relative;width:200px;height:200px;margin-bottom:20px;}
  .ring-wrap svg{transform:rotate(-90deg);width:100%;height:100%;}
  .ring-bg{fill:none;stroke:var(--border);stroke-width:8;}
  .ring-prog{fill:none;stroke:var(--red);stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset 1s linear,stroke .3s;}
  .ring-prog.open{stroke:var(--purple);}
  .ring-prog.urgent{stroke:var(--orange);}
  .ring-digits{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:48px;font-weight:800;letter-spacing:-2px;color:var(--text);}
  .timer-btns{display:flex;gap:10px;width:100%;max-width:320px;margin-bottom:10px;}
  .btn-more{flex:1;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:12px;font-size:12px;cursor:pointer;text-align:center;line-height:1.5;font-family:'DM Sans',sans-serif;}
  .btn-done{flex:1;background:var(--green);border:none;color:#fff;border-radius:12px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;}
  .btn-interrupt{width:100%;max-width:320px;background:var(--orange-light);border:1.5px solid var(--orange);color:var(--orange);border-radius:12px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:14px;font-family:'DM Sans',sans-serif;}
  .quick-capture{width:100%;max-width:320px;border-top:1px solid var(--border);padding-top:12px;}
  .quick-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:7px;}
  .quick-row{display:flex;gap:8px;}
  .input-quick{flex:1;background:#fff;border:1.5px solid var(--border);border-radius:9px;padding:10px 12px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;}
  .input-quick:focus{border-color:var(--red);}
  .input-quick::placeholder{color:var(--muted);}
  .btn-capture{background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:10px 14px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;white-space:nowrap;font-family:'DM Sans',sans-serif;}
  .capture-confirm{font-size:12px;color:var(--green);font-weight:600;margin-top:5px;min-height:16px;text-align:center;}

  /* ALARM */
  .alarm-overlay{position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity .2s;}
  .alarm-overlay.hidden{opacity:0;pointer-events:none;}
  .alarm-overlay.visible{animation:alarm-flash .4s ease infinite;}
  @keyframes alarm-flash{0%,100%{background:rgba(214,59,47,.04)}50%{background:rgba(214,59,47,.13)}}
  .alarm-title{font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:var(--red);text-align:center;}
  .alarm-sub{font-size:13px;color:var(--muted);text-align:center;padding:0 24px;}
  .alarm-btns{display:flex;flex-direction:column;gap:9px;width:280px;}
  .btn-alarm-done{background:var(--green);color:#fff;border:none;border-radius:14px;padding:16px;font-size:16px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;}
  .btn-alarm-more{background:#fff;border:1px solid var(--border);color:var(--text);border-radius:14px;padding:13px;font-size:13px;cursor:pointer;text-align:center;font-family:'DM Sans',sans-serif;}
  .btn-alarm-interrupt{background:var(--orange-light);border:1.5px solid var(--orange);color:var(--orange);border-radius:14px;padding:13px;font-size:13px;font-weight:600;cursor:pointer;text-align:center;font-family:'DM Sans',sans-serif;}

  /* LOADING */
  .loading{display:flex;align-items:center;justify-content:center;height:100dvh;font-size:14px;color:var(--muted);}
  .db-error{background:#fdf1f0;border:1px solid #f5c4c0;border-radius:10px;padding:14px 16px;margin:16px 20px;font-size:13px;color:var(--red);line-height:1.5;}
`;

// ── MAIN COMPONENT ────────────────────────────────────────────────
export default function TaskTimer() {
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [dbError, setDbError]       = useState(null);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncType, setSyncType]     = useState("");

  // Mode & deadline
  const [mode, setModeState]     = useState("deadline");
  const [deadlineH, setDeadlineH] = useState(15);
  const [deadlineM, setDeadlineM] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerVal, setPickerVal]   = useState("15:00");

  // Add task
  const [taskInput, setTaskInput] = useState("");
  const [slotType, setSlotType]   = useState(5);
  const [newSlots, setNewSlots]   = useState(1);

  // Sequence sheet
  const [seqData, setSeqData]     = useState(null); // { seq, originalName }

  // Edit sheet
  const [editTask, setEditTask]   = useState(null);
  const [editName, setEditName]   = useState("");
  const [editSlotType, setEditSlotType] = useState(5);
  const [editSlots, setEditSlots] = useState(1);

  // Timer
  const [activeId, setActiveId]   = useState(null);
  const [secsLeft, setSecsLeft]   = useState(0);
  const [totalSecs, setTotalSecs] = useState(0);
  const [alarmOn, setAlarmOn]     = useState(false);
  const alarmRef                  = useRef(null);
  const sessionStartRef           = useRef(null);

  // Quick capture confirm
  const [captureMsg, setCaptureMsg] = useState("");

  // Countdown display
  const [now, setNow] = useState(new Date());
  useInterval(() => setNow(new Date()), 1000);
  useInterval(() => { if (activeId && !alarmOn) setSecsLeft(s => Math.max(0, s - 1)); }, activeId && !alarmOn ? 1000 : null);
  useEffect(() => { if (secsLeft === 0 && activeId && !alarmOn) triggerAlarm(); }, [secsLeft]);

  // ── DB LOAD ──────────────────────────────────────────────────
  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) { setDbError(error.message); setLoading(false); return; }
    setTasks(data || []);
    setLoading(false);
  }

  function showSync(msg, type, duration = 3000) {
    setSyncStatus(msg); setSyncType(type);
    if (duration) setTimeout(() => { setSyncStatus(""); setSyncType(""); }, duration);
  }

  // ── DB OPERATIONS ────────────────────────────────────────────
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
  function getDeadline() {
    const d = new Date();
    d.setHours(deadlineH, deadlineM, 0, 0);
    return d;
  }

  function applyDeadline() {
    const [h, m] = pickerVal.split(":").map(Number);
    setDeadlineH(h); setDeadlineM(m);
    setShowPicker(false);
  }

  const deadline   = getDeadline();
  const diffMs     = Math.max(0, deadline - now);
  const diffMins   = diffMs / 60000;
  const slots15    = Math.floor(diffMins / 15);
  const slots5     = Math.floor(diffMins / 5);
  const h          = Math.floor(diffMs / 3600000);
  const m          = Math.floor((diffMs % 3600000) / 60000);
  const s          = Math.floor((diffMs % 60000) / 1000);
  const countdownStr = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  const urgent     = diffMs < 15 * 60 * 1000 && diffMs > 0;

  // Budget
  const activeTasks  = tasks.filter(t => !t.done && t.mode !== "open");
  const usedMins     = activeTasks.reduce((a, t) => a + t.estimated_slots * t.slot_minutes, 0);
  const availMins    = Math.round(diffMins);
  const budgetPct    = availMins > 0 ? Math.min((usedMins / availMins) * 100, 100) : (usedMins > 0 ? 100 : 0);
  const budgetOver   = usedMins > availMins;

  // ── ADD TASK ─────────────────────────────────────────────────
  async function addTask(nameOverride, slotsOverride, slotMinsOverride, seqKey) {
    const name = nameOverride || taskInput.trim();
    if (!name) return;

    if (!nameOverride) {
      const match = detectSequence(name);
      if (match) { setSeqData({ seq: match.seq, originalName: name }); setTaskInput(""); return; }
    }

    showSync("Saving…", "saving", 0);
    const taskData = {
      name,
      mode,
      estimated_slots: slotsOverride ?? newSlots,
      slot_minutes: slotMinsOverride ?? slotType,
      actual_slots: 0,
      done: false,
      partial: false,
      remaining_mins: null,
      sequence_key: seqKey || null,
    };
    const saved = await insertTask(taskData);
    if (saved) {
      setTasks(prev => [...prev, saved]);
      showSync("✓ Saved", "ok");
    }
    if (!nameOverride) { setTaskInput(""); setNewSlots(1); }
  }

  async function confirmSeqAll() {
    if (!seqData) return;
    showSync("Saving…", "saving", 0);
    const inserts = seqData.seq.steps.map(s => ({
      name: s.name, mode, estimated_slots: s.slots,
      slot_minutes: s.slotMinutes, actual_slots: 0,
      done: false, partial: false, remaining_mins: null, sequence_key: "seq",
    }));
    const { data, error } = await supabase.from("tasks").insert(inserts).select();
    if (!error && data) { setTasks(prev => [...prev, ...data]); showSync("✓ Saved", "ok"); }
    else showSync("Save failed", "err");
    setSeqData(null);
  }

  async function confirmSeqSingle() {
    if (!seqData) return;
    const s = seqData.seq.singleTask;
    await addTask(s.name, s.slots, s.slotMinutes, null);
    setSeqData(null);
  }

  // ── EDIT ─────────────────────────────────────────────────────
  function openEdit(task) {
    setEditTask(task);
    setEditName(task.name);
    setEditSlotType(task.slot_minutes);
    setEditSlots(task.estimated_slots);
  }

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

  // ── QUICK CAPTURE ────────────────────────────────────────────
  const [quickInput, setQuickInput] = useState("");
  async function quickCapture() {
    const name = quickInput.trim();
    if (!name) return;
    const taskData = { name, mode, estimated_slots: 1, slot_minutes: 15, actual_slots: 0, done: false, partial: false, remaining_mins: null, sequence_key: null };
    const saved = await insertTask(taskData);
    if (saved) { setTasks(prev => [...prev, saved]); setCaptureMsg(`✓ "${name.slice(0,28)}" added`); setTimeout(() => setCaptureMsg(""), 2500); }
    setQuickInput("");
  }

  // ── TIMER ────────────────────────────────────────────────────
  async function startTask(task) {
    if (activeId) return;
    const slotSecs = (task.remaining_mins || task.slot_minutes) * 60;
    const newActual = (task.actual_slots || 0) + 1;
    setActiveId(task.id);
    setSecsLeft(slotSecs);
    setTotalSecs(slotSecs);
    sessionStartRef.current = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, actual_slots: newActual, partial: false, remaining_mins: null } : t));
    await updateTask(task.id, { actual_slots: newActual, partial: false, remaining_mins: null });
  }

  function stopTimer() {
    setActiveId(null);
    setSecsLeft(0);
    setAlarmOn(false);
    if (alarmRef.current) { clearInterval(alarmRef.current); alarmRef.current = null; }
  }

  function triggerAlarm() {
    setAlarmOn(true);
    if (navigator.vibrate) navigator.vibrate([400,200,400,200,400,200,800]);
    playBeep();
    alarmRef.current = setInterval(playBeep, 2500);
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

  function stopAlarm() {
    setAlarmOn(false);
    if (alarmRef.current) { clearInterval(alarmRef.current); alarmRef.current = null; }
    if (navigator.vibrate) navigator.vibrate(0);
  }

  async function addMoreTime() {
    stopAlarm();
    const task = tasks.find(t => t.id === activeId);
    if (!task) return;
    const newActual = task.actual_slots + 1;
    const slotSecs  = task.slot_minutes * 60;
    setSecsLeft(slotSecs); setTotalSecs(slotSecs);
    setTasks(prev => prev.map(t => t.id === activeId ? { ...t, actual_slots: newActual } : t));
    await updateTask(activeId, { actual_slots: newActual });
    await insertSession(activeId, sessionStartRef.current, new Date().toISOString(), "extended");
    sessionStartRef.current = new Date().toISOString();
  }

  async function completeTask() {
    stopAlarm();
    const task = tasks.find(t => t.id === activeId);
    if (!task) return;
    const now = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === activeId ? { ...t, done: true, partial: false } : t));
    await updateTask(activeId, { done: true, partial: false, completed_at: now });
    await insertSession(activeId, sessionStartRef.current, now, "completed");
    stopTimer();
  }

  async function markInterrupted() {
    stopAlarm();
    const task = tasks.find(t => t.id === activeId);
    if (!task) return;
    const remaining = Math.max(1, Math.ceil(secsLeft / 60));
    const now = new Date().toISOString();
    const updated = { ...task, partial: true, remaining_mins: remaining, done: false };
    setTasks(prev => [...prev.filter(t => t.id !== activeId), updated]);
    await updateTask(activeId, { partial: true, remaining_mins: remaining });
    await insertSession(activeId, sessionStartRef.current, now, "interrupted");
    stopTimer();
  }

  // ── RENDER HELPERS ───────────────────────────────────────────
  function buildPips(task) {
    const total = Math.max(task.estimated_slots, task.actual_slots || 0);
    return Array.from({ length: total }, (_, i) => {
      let cls = "pip" + (task.slot_minutes === 5 ? " mini" : "");
      if (task.done)                                 cls += " done-pip";
      else if (task.partial && i < task.actual_slots) cls += " partial-pip";
      else if (i >= task.estimated_slots)            cls += " extra";
      else cls += task.mode === "open" ? " open-pip" : " filled";
      return <div key={i} className={cls} />;
    });
  }

  function buildCard(task) {
    const isActive = task.id === activeId;
    const cls = ["task-card", isActive ? "is-active" : task.done ? "is-done" : task.partial ? "is-partial" : task.mode === "open" ? "is-open" : ""].filter(Boolean).join(" ");
    const estMins = task.estimated_slots * task.slot_minutes;
    const actMins = (task.actual_slots || 0) * task.slot_minutes;
    const label   = task.done ? `${estMins}min est · ${actMins}min real` : `${task.estimated_slots} × ${task.slot_minutes}min`;

    return (
      <div key={task.id} className={cls}>
        <div className="task-info">
          <div className="task-name-row">
            {task.partial && <span className="partial-icon">🔄</span>}
            <div className="task-name">{task.name}</div>
          </div>
          <div className="task-meta">
            <div className="pips">{buildPips(task)}</div>
            <span className="meta-label">{label}</span>
            {task.partial && task.remaining_mins && <span className="partial-time">~{task.remaining_mins}min left</span>}
          </div>
        </div>
        <div className="task-right">
          {task.done ? (
            <span className="done-badge">✓</span>
          ) : isActive ? (
            <span className="active-badge">ACTIVE</span>
          ) : (
            <>
              <button className="btn-edit" onClick={() => openEdit(task)}>✏️</button>
              <button className={`btn-start${task.mode === "open" ? " open" : ""}`} onClick={() => startTask(task)}>
                {task.partial ? "RESUME" : "START"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Split tasks into sections
  const visible  = tasks.filter(t => mode === "open" ? t.mode === "open" : t.mode !== "open");
  const todo     = visible.filter(t => !t.done && !t.partial);
  const partial  = visible.filter(t => t.partial && !t.done);
  const done     = visible.filter(t => t.done);

  // Ring
  const ringPct    = totalSecs > 0 ? secsLeft / totalSecs : 0;
  const ringOffset = 276.46 * (1 - ringPct);
  const activeTask = tasks.find(t => t.id === activeId);

  if (loading) return <><style>{css}</style><div className="loading">Loading your tasks…</div></>;

  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* ── HEADER ── */}
        <div className="header">
          <div className="header-top">
            <div style={{flex:1,minWidth:0}}>
              <div className="mode-tabs">
                <button className={`mode-tab${mode==="deadline"?" deadline":""}`} onClick={() => setModeState("deadline")}>⏰ Deadline</button>
                <button className={`mode-tab${mode==="open"?" open":""}`}         onClick={() => setModeState("open")}>∞ Open</button>
              </div>
              {mode === "deadline" ? (
                <>
                  <div className="deadline-row">
                    <div className={`countdown${urgent?" urgent":""}`}>{countdownStr}</div>
                    <button className="btn-change" onClick={() => setShowPicker(p => !p)}>change</button>
                  </div>
                  {showPicker && (
                    <div className="deadline-picker">
                      <input type="time" value={pickerVal} onChange={e => setPickerVal(e.target.value)} />
                      <button className="btn-set" onClick={applyDeadline}>Set</button>
                    </div>
                  )}
                  <div className="slots-avail"><strong>{slots15}</strong> × 15min &nbsp;·&nbsp; <strong>{slots5}</strong> × 5min slots left</div>
                </>
              ) : (
                <div className="countdown open">{tasks.filter(t=>!t.done&&t.mode==="open").length} open tasks</div>
              )}
            </div>
            <div>
              <div className="drive-btns">
                <button className="btn-drive" onClick={() => showSync("Auto-saved ✓", "ok")}>✓ Auto-saved</button>
              </div>
              <div className={`sync-status${syncType?" "+syncType:""}`}>{syncStatus}</div>
            </div>
          </div>
          <div className="budget-row">
            <div className="budget-bar">
              <div className={`budget-fill${budgetOver?" over":""}${mode==="open"?" open-fill":""}`} style={{width:mode==="open"?"30%":budgetPct+"%"}} />
            </div>
            <div className="budget-text">
              {mode==="open" ? <><strong>{tasks.filter(t=>!t.done&&t.mode==="open").reduce((a,t)=>a+t.estimated_slots*t.slot_minutes,0)}min</strong> of open tasks</> : <><strong>{usedMins}min</strong> assigned · <strong>{availMins}min</strong> left</>}
            </div>
          </div>
          {dbError && <div className="db-error">⚠️ Database error: {dbError}</div>}
        </div>

        {/* ── TASK LIST ── */}
        <div className="task-list">
          {visible.length === 0 && <div className="empty">No tasks yet.<br/>Add your first one below ↓</div>}
          {todo.map(buildCard)}
          {partial.length > 0 && <><div className="section-label">⚠️ Unfinished</div>{partial.map(buildCard)}</>}
          {done.length   > 0 && <><div className="section-label">✓ Done</div>{done.map(buildCard)}</>}
        </div>

        {/* ── ADD TASK ── */}
        <div className="add-section">
          <div className="add-row">
            <input className="input-task" value={taskInput} onChange={e=>setTaskInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="What needs doing?" autoComplete="off" />
          </div>
          <div className="add-row">
            <div className="slot-controls">
              <div className="slot-toggle">
                <button className={`slot-toggle-btn${slotType===5?" active":""}`} onClick={()=>setSlotType(5)}>5m</button>
                <button className={`slot-toggle-btn${slotType===15?" active":""}`} onClick={()=>setSlotType(15)}>15m</button>
              </div>
              <div className="slot-stepper">
                <button className="slot-step-btn" onClick={()=>setNewSlots(s=>Math.max(1,s-1))}>−</button>
                <span className="slot-num">{newSlots}</span>
                <span className="slot-min">{newSlots*slotType}m</span>
                <button className="slot-step-btn" onClick={()=>setNewSlots(s=>Math.min(24,s+1))}>+</button>
              </div>
            </div>
          </div>
          <button className={`btn-add${mode==="open"?" open":""}`} onClick={()=>addTask()}>+ Add Task</button>
        </div>

        {/* ── SEQUENCE SHEET ── */}
        <div className={`sheet-backdrop${seqData?"":" hidden"}`}>
          <div className="sheet">
            <div className="sheet-title">{seqData?.seq.label} — full sequence</div>
            <div className="sheet-sub">These are dependent steps — each one leads to the next.</div>
            {seqData?.seq.steps.map((s,i) => (
              <div key={i} className="seq-item">
                <span className="seq-name">{i+1}. {s.name}</span>
                <span className="seq-time">{s.slots>1?`${s.slots} × `:""}{s.slotMinutes}min</span>
              </div>
            ))}
            <div className="sheet-actions">
              <button className="btn-sheet-cancel" onClick={()=>setSeqData(null)}>Cancel</button>
              <button className="btn-sheet-single" onClick={confirmSeqSingle}>Just this task</button>
              <button className="btn-sheet-all"    onClick={confirmSeqAll}>Full sequence</button>
            </div>
          </div>
        </div>

        {/* ── EDIT SHEET ── */}
        <div className={`sheet-backdrop${editTask?"":" hidden"}`} onClick={e=>e.target===e.currentTarget&&setEditTask(null)}>
          <div className="sheet">
            <div className="modal-title">Edit Task</div>
            <input className="modal-input" value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Task name" />
            <div className="modal-row">
              <span className="modal-label">Slots:</span>
              <div className="slot-toggle">
                <button className={`slot-toggle-btn${editSlotType===5?" active":""}`} onClick={()=>setEditSlotType(5)}>5m</button>
                <button className={`slot-toggle-btn${editSlotType===15?" active":""}`} onClick={()=>setEditSlotType(15)}>15m</button>
              </div>
              <div className="slot-stepper" style={{marginLeft:4}}>
                <button className="slot-step-btn" onClick={()=>setEditSlots(s=>Math.max(1,s-1))}>−</button>
                <span className="slot-num">{editSlots}</span>
                <span className="slot-min">{editSlots*editSlotType}m</span>
                <button className="slot-step-btn" onClick={()=>setEditSlots(s=>Math.min(24,s+1))}>+</button>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-modal-delete" onClick={()=>deleteTask(editTask.id)}>Delete</button>
              <button className="btn-modal-cancel" onClick={()=>setEditTask(null)}>Cancel</button>
              <button className="btn-modal-save"   onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>

        {/* ── TIMER OVERLAY ── */}
        <div className={`timer-overlay${activeId?"":" hidden"}`}>
          <div className={`timer-task${activeTask?.mode==="open"?" open":""}`}>{activeTask?.name}</div>
          <div className="timer-info">slot {activeTask?.actual_slots} · {activeTask?.slot_minutes}min</div>
          <div className="ring-wrap">
            <svg viewBox="0 0 100 100">
              <circle className="ring-bg" cx="50" cy="50" r="44"/>
              <circle className={`ring-prog${activeTask?.mode==="open"?" open":""}${secsLeft<60?" urgent":""}`}
                cx="50" cy="50" r="44" strokeDasharray="276.46" strokeDashoffset={ringOffset}/>
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
              <input className="input-quick" value={quickInput} onChange={e=>setQuickInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&quickCapture()} placeholder="e.g. take laundry out of wash…" />
              <button className="btn-capture" onClick={quickCapture}>Add</button>
            </div>
            {captureMsg && <div className="capture-confirm">{captureMsg}</div>}
          </div>
        </div>

        {/* ── ALARM OVERLAY ── */}
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
