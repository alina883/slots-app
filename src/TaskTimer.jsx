import { useState, useEffect, useRef } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = "https://cdzanvtkqkyexljvovan.supabase.co";
const SUPABASE_KEY  = "sb_publishable_IgUV3oZYjYrtvkJUa33aEg_5FD9vJ2B";
const TRELLO_FUNCTION = "https://cdzanvtkqkyexljvovan.supabase.co/functions/v1/trello-sync";
const supabase      = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── HELPERS ───────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }
function fmtSecs(s) { return `${pad(Math.floor(s/60))}:${pad(s%60)}`; }

function useInterval(cb, delay) {
  const saved = useRef(cb);
  useEffect(() => { saved.current = cb; }, [cb]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ── QUICK TASKS POOL ──────────────────────────────────────────────
const QUICK_TASKS = [
  { category: "🏠 Cleaning", tasks: [
    { name: "Hoover downstairs",        slots: 2, mins: 15 },
    { name: "Hoover upstairs",          slots: 2, mins: 15 },
    { name: "Mop kitchen floor",        slots: 1, mins: 15 },
    { name: "Wipe down surfaces",       slots: 1, mins: 15 },
    { name: "Clean bathrooms",          slots: 2, mins: 15 },
    { name: "Quick kitchen sweep",      slots: 1, mins: 5  },
    { name: "Empty bins",               slots: 1, mins: 5  },
    { name: "Clean air fryer",          slots: 1, mins: 15 },
    { name: "Deep clean kitchen units", slots: 2, mins: 15 },
  ]},
  { category: "🧺 Laundry", tasks: [
    { name: "Sort laundry",                       slots: 1, mins: 5  },
    { name: "Load washing machine",               slots: 1, mins: 5  },
    { name: "Move to tumble dryer / hang to dry", slots: 1, mins: 5  },
    { name: "Fold clothes",                       slots: 1, mins: 15 },
    { name: "Put clothes away",                   slots: 1, mins: 15 },
  ]},
  { category: "🍽 Kitchen", tasks: [
    { name: "Unload dishwasher",   slots: 1, mins: 5  },
    { name: "Load dishwasher",     slots: 1, mins: 5  },
    { name: "Wash up",             slots: 1, mins: 15 },
    { name: "Wipe down hob",       slots: 1, mins: 5  },
    { name: "Clear kitchen table", slots: 1, mins: 5  },
  ]},
  { category: "🗂 Tidying", tasks: [
    { name: "Tidy living room",    slots: 1, mins: 15 },
    { name: "Tidy bedroom",        slots: 1, mins: 15 },
    { name: "Tidy kids rooms",     slots: 2, mins: 15 },
    { name: "Clear hallway",       slots: 1, mins: 5  },
    { name: "Sort recycling",      slots: 1, mins: 5  },
    { name: "Put things away",     slots: 1, mins: 15 },
  ]},
  { category: "🌿 Garden", tasks: [
    { name: "Water plants",        slots: 1, mins: 15 },
    { name: "Check for shoots",    slots: 1, mins: 5  },
    { name: "Weekly garden feed",  slots: 1, mins: 15 },
    { name: "Tidy garden",         slots: 2, mins: 15 },
  ]},
  { category: "🧒 Kids", tasks: [
    { name: "School run — drop off", slots: 4, mins: 15 },
    { name: "School run — pick up",  slots: 4, mins: 15 },
    { name: "Pack school bags",      slots: 1, mins: 5  },
    { name: "Sort packed lunches",   slots: 1, mins: 15 },
  ]},
];

// ── CSS ───────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #fafaf8; --surface: #f0efea; --border: #e2e0d8;
    --text: #1a1916; --muted: #928f84;
    --red: #d63b2f; --red-dark: #b02e24; --red-light: #fdf1f0;
    --green: #2a7d4f; --green-light: #f0faf4;
    --orange: #c45e1a; --orange-light: #fdf6f0;
    --radius: 14px;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; }
  body { margin: 0; }
  .app { display: flex; flex-direction: column; height: 100dvh; width: 100%; max-width: 480px; margin: 0 auto; background: var(--bg); overflow: hidden; }

  /* HEADER */
  .header { padding: 14px 20px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sprint-time { display: flex; flex-direction: column; }
  .sprint-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 2px; }
  .sprint-countdown { font-size: 34px; font-weight: 700; letter-spacing: -1px; line-height: 1; color: var(--red); cursor: pointer; }
  .sprint-countdown.urgent { animation: pulse .9s ease-in-out infinite; }
  .sprint-countdown.idle { color: var(--muted); font-size: 24px; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  .sprint-slots { font-size: 11px; color: var(--muted); margin-top: 3px; }
  .sprint-slots strong { color: var(--text); }
  .header-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
  .btn-time { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px 11px; font-size: 12px; font-weight: 600; color: var(--muted); cursor: pointer; font-family: 'Inter', sans-serif; }
  .btn-time.active { background: var(--red); color: #fff; border-color: var(--red); }
  .time-picker-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .time-picker-row input { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 7px 11px; font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 700; color: var(--text); outline: none; }
  .btn-go { background: var(--red); color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; }

  /* BUDGET BAR */
  .budget-wrap { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
  .budget-bar { flex: 1; height: 4px; background: var(--border); border-radius: 99px; overflow: hidden; }
  .budget-fill { height: 100%; border-radius: 99px; background: var(--red); transition: width .4s ease, background .3s; }
  .budget-fill.over { background: var(--orange); }
  .budget-text { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .budget-text strong { color: var(--text); }

  /* TASK LIST */
  .task-list { flex: 1; overflow-y: auto; padding: 10px 16px; display: flex; flex-direction: column; gap: 6px; }
  .empty-state { text-align: center; color: var(--muted); font-size: 13px; padding: 48px 20px; line-height: 1.9; }

  .task-card { background: #fff; border: 1.5px solid var(--border); border-radius: var(--radius); padding: 11px 13px; display: flex; align-items: center; gap: 10px; transition: border-color .2s, background .2s; }
  .task-card.active { border-color: var(--red); background: var(--red-light); }
  .task-card.partial { border-color: var(--orange); background: var(--orange-light); }
  .task-card.done-card { background: var(--surface); border-color: transparent; padding: 5px 13px; opacity: .55; }

  .task-name { font-size: 14px; font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .task-name.done-name { font-size: 12px; text-decoration: line-through; color: var(--muted); font-weight: 400; }
  .task-meta { font-size: 10px; color: var(--muted); margin-top: 2px; }
  .partial-tag { font-size: 10px; color: var(--orange); font-weight: 600; }
  .done-tick { font-size: 14px; color: var(--green); flex-shrink: 0; }

  .btn-start { background: var(--red); color: #fff; border: none; border-radius: 8px; padding: 7px 13px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; flex-shrink: 0; }
  .btn-start:active { opacity: .8; }
  .active-tag { font-size: 10px; color: var(--red); font-weight: 700; flex-shrink: 0; }

  .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 6px 0 2px; }

  /* ADD STRIP */
  .add-strip { flex-shrink: 0; border-top: 1px solid var(--border); background: var(--bg); }

  .add-row { display: flex; gap: 0; }
  .input-task { flex: 1; background: #fff; border: none; border-top: none; padding: 12px 14px; color: var(--text); font-family: 'Inter', sans-serif; font-size: 14px; outline: none; border-right: 1px solid var(--border); }
  .input-task::placeholder { color: var(--muted); }

  .slot-controls-inline { display: flex; align-items: center; background: var(--surface); }
  .slot-toggle-sm { display: flex; }
  .slot-toggle-sm button { background: none; border: none; border-right: 1px solid var(--border); padding: 0 9px; font-size: 11px; font-weight: 700; color: var(--muted); cursor: pointer; height: 100%; font-family: 'Inter', sans-serif; }
  .slot-toggle-sm button.on { background: var(--red); color: #fff; }
  .slot-step { background: none; border: none; width: 28px; font-size: 16px; cursor: pointer; color: var(--text); height: 100%; display: flex; align-items: center; justify-content: center; }
  .slot-step:active { background: var(--border); }
  .slot-val { font-size: 13px; font-weight: 700; color: var(--red); min-width: 18px; text-align: center; }
  .slot-unit { font-size: 10px; color: var(--muted); padding-right: 6px; }

  .btn-add-task { background: var(--red); color: #fff; border: none; padding: 0 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; white-space: nowrap; }
  .btn-add-task:active { background: var(--red-dark); }

  /* SOURCE BUTTONS */
  .source-btns { display: flex; gap: 0; border-top: 1px solid var(--border); }
  .btn-source { flex: 1; background: var(--surface); border: none; border-right: 1px solid var(--border); padding: 10px 6px; font-size: 11px; font-weight: 600; color: var(--muted); cursor: pointer; font-family: 'Inter', sans-serif; text-align: center; transition: background .15s, color .15s; }
  .btn-source:last-child { border-right: none; }
  .btn-source:active { background: var(--border); }
  .btn-source.loading { opacity: .6; pointer-events: none; }

  /* SHEETS */
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 100; display: flex; align-items: flex-end; transition: opacity .2s; }
  .backdrop.off { opacity: 0; pointer-events: none; }
  .sheet { background: var(--bg); border-radius: 20px 20px 0 0; padding: 20px 20px 32px; width: 100%; max-height: 85vh; overflow-y: auto; }
  .sheet-title { font-size: 16px; font-weight: 700; color: var(--red); margin-bottom: 4px; }
  .sheet-sub { font-size: 12px; color: var(--muted); margin-bottom: 14px; }
  .sheet-actions { display: flex; gap: 8px; margin-top: 14px; }
  .btn-cancel { background: var(--surface); border: 1px solid var(--border); color: var(--muted); border-radius: 10px; padding: 12px 14px; font-size: 13px; cursor: pointer; font-family: 'Inter', sans-serif; }
  .btn-confirm { flex: 1; background: var(--red); color: #fff; border: none; border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; }

  /* QUICK TASK POOL SHEET */
  .cat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 10px 0 6px; }
  .quick-task-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
  .quick-task-row:last-child { border-bottom: none; }
  .quick-task-name { font-size: 13px; font-weight: 500; flex: 1; }
  .quick-task-time { font-size: 11px; color: var(--muted); margin: 0 10px; white-space: nowrap; }
  .qt-check { width: 18px; height: 18px; border-radius: 5px; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; transition: all .15s; }
  .qt-check.on { background: var(--green); border-color: var(--green); color: #fff; }

  /* TRELLO SHEET */
  .trello-card-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
  .trello-card-row:last-child { border-bottom: none; }
  .trello-list-tag { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; background: var(--surface); border-radius: 4px; padding: 2px 5px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }

  /* TIMER OVERLAY */
  .timer-overlay { position: fixed; inset: 0; background: var(--bg); z-index: 200; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; transition: opacity .3s; }
  .timer-overlay.off { opacity: 0; pointer-events: none; }
  .timer-task-name { font-size: 20px; font-weight: 700; color: var(--red); text-align: center; margin-bottom: 4px; }
  .timer-slot-info { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 22px; }
  .ring-wrap { position: relative; width: 200px; height: 200px; margin-bottom: 20px; }
  .ring-wrap svg { transform: rotate(-90deg); width: 100%; height: 100%; }
  .ring-bg { fill: none; stroke: var(--border); stroke-width: 8; }
  .ring-prog { fill: none; stroke: var(--red); stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 1s linear, stroke .3s; }
  .ring-prog.urgent { stroke: var(--orange); }
  .ring-digits { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 48px; font-weight: 700; letter-spacing: -2px; color: var(--text); }
  .timer-btns { display: flex; gap: 10px; width: 100%; max-width: 300px; margin-bottom: 10px; }
  .btn-more { flex: 1; background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 12px; padding: 12px; font-size: 12px; cursor: pointer; text-align: center; line-height: 1.5; font-family: 'Inter', sans-serif; }
  .btn-done-t { flex: 1; background: var(--green); border: none; color: #fff; border-radius: 12px; padding: 12px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; }
  .btn-interrupt { width: 100%; max-width: 300px; background: var(--orange-light); border: 1.5px solid var(--orange); color: var(--orange); border-radius: 12px; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 12px; font-family: 'Inter', sans-serif; }
  .quick-capture { width: 100%; max-width: 300px; border-top: 1px solid var(--border); padding-top: 12px; }
  .qc-label { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 6px; }
  .qc-row { display: flex; gap: 8px; }
  .qc-input { flex: 1; background: #fff; border: 1.5px solid var(--border); border-radius: 9px; padding: 9px 12px; color: var(--text); font-family: 'Inter', sans-serif; font-size: 13px; outline: none; }
  .qc-input:focus { border-color: var(--red); }
  .qc-input::placeholder { color: var(--muted); }
  .btn-qc { background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 9px 13px; font-size: 13px; font-weight: 600; color: var(--text); cursor: pointer; font-family: 'Inter', sans-serif; }
  .qc-confirm { font-size: 12px; color: var(--green); font-weight: 600; margin-top: 5px; min-height: 16px; }

  /* ALARM */
  .alarm-overlay { position: fixed; inset: 0; z-index: 300; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; transition: opacity .2s; }
  .alarm-overlay.off { opacity: 0; pointer-events: none; }
  .alarm-overlay.on { animation: alarm-flash .4s ease infinite; }
  @keyframes alarm-flash { 0%,100%{background:rgba(214,59,47,.04)} 50%{background:rgba(214,59,47,.14)} }
  .alarm-title { font-size: 26px; font-weight: 700; color: var(--red); }
  .alarm-sub { font-size: 13px; color: var(--muted); text-align: center; padding: 0 24px; }
  .alarm-btns { display: flex; flex-direction: column; gap: 9px; width: 280px; }
  .btn-a-done { background: var(--green); color: #fff; border: none; border-radius: 14px; padding: 16px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; }
  .btn-a-more { background: #fff; border: 1px solid var(--border); color: var(--text); border-radius: 14px; padding: 13px; font-size: 13px; cursor: pointer; text-align: center; font-family: 'Inter', sans-serif; }
  .btn-a-interrupt { background: var(--orange-light); border: 1.5px solid var(--orange); color: var(--orange); border-radius: 14px; padding: 13px; font-size: 13px; font-weight: 600; cursor: pointer; text-align: center; font-family: 'Inter', sans-serif; }
  .loading-state { text-align: center; color: var(--muted); font-size: 13px; padding: 30px 0; }
`;

// ── SWIPE TO DELETE ───────────────────────────────────────────────
function SwipeDelete({ onDelete, children }) {
  const startX = useRef(null);
  const [offset, setOffset] = useState(0);
  const [triggered, setTriggered] = useState(false);

  function onTouchStart(e) { startX.current = e.touches[0].clientX; setTriggered(false); }
  function onTouchMove(e) {
    if (startX.current === null) return;
    const dx = Math.max(-80, Math.min(0, e.touches[0].clientX - startX.current));
    setOffset(dx);
    setTriggered(dx < -50);
  }
  function onTouchEnd() {
    if (triggered) onDelete?.();
    setOffset(0); setTriggered(false); startX.current = null;
  }

  return (
    <div style={{ position:"relative", borderRadius:14, overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, background:"var(--red)", display:"flex", alignItems:"center", justifyContent:"flex-end", padding:"0 18px", color:"#fff", fontSize:12, fontWeight:700 }}>
        {triggered ? "Release to delete" : "🗑"}
      </div>
      <div style={{ transform:`translateX(${offset}px)`, transition:offset===0?"transform .3s ease":"none", position:"relative" }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {children}
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────
export default function TaskTimer() {
  // ── STATE ────────────────────────────────────────────────────
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);

  // Sprint
  const [endTime, setEndTime]   = useState("");
  const [pickerVal, setPickerVal] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [sprintActive, setSprintActive] = useState(false);
  const [now, setNow]           = useState(new Date());

  // Add task
  const [taskInput, setTaskInput] = useState("");
  const [slotMins, setSlotMins] = useState(15);
  const [slotCount, setSlotCount] = useState(1);

  // Sheets
  const [poolOpen, setPoolOpen]     = useState(false);
  const [trelloOpen, setTrelloOpen] = useState(false);
  const [selectedQuick, setSelectedQuick] = useState({}); // { "task name": true }
  const [trelloCards, setTrelloCards] = useState([]);
  const [trelloLoading, setTrelloLoading] = useState(false);
  const [trelloSelected, setTrelloSelected] = useState({});
  const [syncStatus, setSyncStatus] = useState("");

  // Timer
  const [activeId, setActiveId]   = useState(null);
  const [secsLeft, setSecsLeft]   = useState(0);
  const [totalSecs, setTotalSecs] = useState(0);
  const [alarmOn, setAlarmOn]     = useState(false);
  const alarmRef                  = useRef(null);
  const sessionStart              = useRef(null);

  // Quick capture
  const [qcInput, setQcInput]     = useState("");
  const [qcMsg, setQcMsg]         = useState("");

  // ── INTERVALS ─────────────────────────────────────────────────
  useInterval(() => setNow(new Date()), 1000);
  useInterval(() => { if (activeId && !alarmOn) setSecsLeft(s => Math.max(0, s-1)); }, activeId && !alarmOn ? 1000 : null);
  useEffect(() => { if (secsLeft === 0 && activeId && !alarmOn) triggerAlarm(); }, [secsLeft]);

  // ── LOAD ──────────────────────────────────────────────────────
  useEffect(() => { loadTasks(); }, []);

  async function loadTasks() {
    setLoading(true);
    const { data } = await supabase.from("tasks").select("*").eq("done", false).order("created_at", { ascending: true });
    setTasks(data || []);
    setLoading(false);
  }

  // ── DB ────────────────────────────────────────────────────────
  async function insertTask(t) {
    const { data } = await supabase.from("tasks").insert([t]).select().single();
    return data;
  }
  async function updateTask(id, updates) {
    await supabase.from("tasks").update(updates).eq("id", id);
  }
  async function deleteTask(id) {
    if (activeId === id) stopTimer();
    await supabase.from("tasks").delete().eq("id", id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }
  async function insertSession(taskId, startedAt, endedAt, outcome) {
    await supabase.from("sessions").insert([{ task_id: taskId, started_at: startedAt, ended_at: endedAt, outcome }]);
  }

  // ── SPRINT TIME ───────────────────────────────────────────────
  function getSprintEnd() {
    if (!endTime) return null;
    const [h, m] = endTime.split(":").map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d;
  }
  const sprintEnd   = getSprintEnd();
  const diffMs      = sprintEnd ? Math.max(0, sprintEnd - now) : 0;
  const diffMins    = diffMs / 60000;
  const sprintH     = Math.floor(diffMs / 3600000);
  const sprintM     = Math.floor((diffMs % 3600000) / 60000);
  const sprintS     = Math.floor((diffMs % 60000) / 1000);
  const sprintStr   = endTime ? (sprintH > 0 ? `${sprintH}:${pad(sprintM)}:${pad(sprintS)}` : `${pad(sprintM)}:${pad(sprintS)}`) : "Set time";
  const slots15     = Math.floor(diffMins / 15);
  const urgent      = diffMs < 5 * 60 * 1000 && diffMs > 0 && sprintActive;
  const usedMins    = tasks.filter(t => !t.done).reduce((a, t) => a + t.estimated_slots * t.slot_minutes, 0);
  const budgetPct   = diffMins > 0 ? Math.min((usedMins / diffMins) * 100, 100) : 0;
  const budgetOver  = usedMins > diffMins && diffMins > 0;

  function applyTime() {
    setEndTime(pickerVal);
    setSprintActive(true);
    setShowPicker(false);
  }

  // ── ADD TASK ──────────────────────────────────────────────────
  async function addTask(nameOverride, slotsOverride, minsOverride) {
    const name = nameOverride || taskInput.trim();
    if (!name) return;
    const saved = await insertTask({ name, mode:"deadline", estimated_slots: slotsOverride ?? slotCount, slot_minutes: minsOverride ?? slotMins, actual_slots:0, done:false, partial:false });
    if (saved) setTasks(prev => [...prev, saved]);
    if (!nameOverride) { setTaskInput(""); setSlotCount(1); }
  }

  // ── QUICK POOL ────────────────────────────────────────────────
  function toggleQuick(key) {
    setSelectedQuick(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function addQuickTasks() {
    const toAdd = [];
    QUICK_TASKS.forEach(cat => {
      cat.tasks.forEach(t => {
        if (selectedQuick[t.name]) toAdd.push(t);
      });
    });
    for (const t of toAdd) {
      const saved = await insertTask({ name: t.name, mode:"deadline", estimated_slots: t.slots, slot_minutes: t.mins, actual_slots:0, done:false, partial:false });
      if (saved) setTasks(prev => [...prev, saved]);
    }
    setSelectedQuick({});
    setPoolOpen(false);
  }

  // ── TRELLO ────────────────────────────────────────────────────
  async function openTrello() {
    setTrelloOpen(true);
    setTrelloLoading(true);
    setTrelloCards([]);
    setTrelloSelected({});
    try {
      const res  = await fetch(`https://api.trello.com/1/boards/69c063f73c7f4272763a840a/cards?key=99b1d4e3295fd6a6eaeffdaa9a8a3ec1&token=ATTAc564cf6d3b7174a2b101bd87b2fb7ffd91fa75858dc44464e87981724866cd4aE88E1191&fields=id,name,idList&filter=open`);
      const cards = await res.json();
      const listsRes = await fetch(`https://api.trello.com/1/boards/69c063f73c7f4272763a840a/lists?key=99b1d4e3295fd6a6eaeffdaa9a8a3ec1&token=ATTAc564cf6d3b7174a2b101bd87b2fb7ffd91fa75858dc44464e87981724866cd4aE88E1191`);
      const lists = await listsRes.json();
      const listMap = {};
      lists.forEach(l => { listMap[l.id] = l.name; });
      const doneId = lists.find(l => l.name.toUpperCase() === "DONE")?.id;
      const open = cards.filter(c => c.idList !== doneId).map(c => ({ ...c, listName: listMap[c.idList] || "" }));
      setTrelloCards(open);
    } catch(e) {
      setSyncStatus("Failed to load Trello");
    }
    setTrelloLoading(false);
  }

  async function addTrelloTasks() {
    const toAdd = trelloCards.filter(c => trelloSelected[c.id]);
    const existingTrelloIds = new Set(tasks.filter(t => t.trello_card_id).map(t => t.trello_card_id));
    for (const card of toAdd) {
      if (existingTrelloIds.has(card.id)) continue;
      const saved = await insertTask({ name: card.name, mode:"deadline", estimated_slots:0, slot_minutes:15, actual_slots:0, done:false, partial:false, trello_card_id: card.id, trello_list: card.listName });
      if (saved) setTasks(prev => [...prev, saved]);
    }
    setTrelloOpen(false);
    setTrelloSelected({});
  }

  // ── QUICK CAPTURE ─────────────────────────────────────────────
  async function quickCapture() {
    const name = qcInput.trim(); if (!name) return;
    const saved = await insertTask({ name, mode:"deadline", estimated_slots:1, slot_minutes:15, actual_slots:0, done:false, partial:false });
    if (saved) { setTasks(prev => [...prev, saved]); setQcMsg(`✓ "${name.slice(0,24)}" added`); setTimeout(()=>setQcMsg(""),2000); }
    setQcInput("");
  }

  // ── TIMER ─────────────────────────────────────────────────────
  async function startTask(task) {
    if (activeId) return;
    const secs = (task.remaining_mins || task.slot_minutes || 15) * 60;
    const newActual = (task.actual_slots || 0) + 1;
    setActiveId(task.id); setSecsLeft(secs); setTotalSecs(secs);
    sessionStart.current = new Date().toISOString();
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
      [880,880,1046].forEach((freq,i) => {
        const osc=ctx.createOscillator(), gain=ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value=freq; osc.type="square";
        const t=ctx.currentTime+i*.18;
        gain.gain.setValueAtTime(.2,t); gain.gain.exponentialRampToValueAtTime(.001,t+.14);
        osc.start(t); osc.stop(t+.15);
      });
    } catch(e){}
  }

  function stopAlarm() { setAlarmOn(false); if(alarmRef.current){clearInterval(alarmRef.current);alarmRef.current=null;} if(navigator.vibrate)navigator.vibrate(0); }

  async function addMoreTime() {
    stopAlarm();
    const task = tasks.find(t => t.id===activeId); if(!task) return;
    const slotSecs = (task.slot_minutes||15)*60;
    setSecsLeft(slotSecs); setTotalSecs(slotSecs);
    const newActual = task.actual_slots+1;
    setTasks(prev => prev.map(t => t.id===activeId?{...t,actual_slots:newActual}:t));
    await updateTask(activeId,{actual_slots:newActual});
    await insertSession(activeId, sessionStart.current, new Date().toISOString(), "extended");
    sessionStart.current = new Date().toISOString();
  }

  async function completeTask() {
    stopAlarm();
    const task = tasks.find(t=>t.id===activeId); if(!task) return;
    const nowStr = new Date().toISOString();
    await updateTask(activeId,{done:true,partial:false,completed_at:nowStr});
    await insertSession(activeId, sessionStart.current, nowStr, "completed");
    setTasks(prev => prev.map(t => t.id===activeId?{...t,done:true,partial:false}:t));
    stopTimer();
  }

  async function markInterrupted() {
    stopAlarm();
    const task = tasks.find(t=>t.id===activeId); if(!task) return;
    const remaining = Math.max(1, Math.ceil(secsLeft/60));
    const nowStr = new Date().toISOString();
    await updateTask(activeId,{partial:true,remaining_mins:remaining});
    await insertSession(activeId, sessionStart.current, nowStr, "interrupted");
    setTasks(prev => prev.map(t => t.id===activeId?{...t,partial:true,remaining_mins:remaining}:t));
    stopTimer();
  }

  // ── RENDER ────────────────────────────────────────────────────
  const activeTask = tasks.find(t => t.id===activeId);
  const ringOffset = totalSecs > 0 ? 276.46*(1-secsLeft/totalSecs) : 0;

  const todo    = tasks.filter(t => !t.done && !t.partial);
  const partial = tasks.filter(t => t.partial && !t.done);
  const done    = tasks.filter(t => t.done);

  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* HEADER */}
        <div className="header">
          <div className="header-row">
            <div className="sprint-time">
              <div className="sprint-label">{sprintActive ? "sprint ends in" : "sprint"}</div>
              <div className={`sprint-countdown${urgent?" urgent":""}${!endTime?" idle":""}`}
                onClick={() => setShowPicker(p => !p)}>
                {sprintStr}
              </div>
              {endTime && <div className="sprint-slots"><strong>{slots15}</strong> × 15min slots left</div>}
            </div>
            <div className="header-actions">
              {sprintActive && (
                <button className="btn-time" onClick={() => { setEndTime(""); setSprintActive(false); }}>End sprint</button>
              )}
            </div>
          </div>

          {showPicker && (
            <div className="time-picker-row">
              <input type="time" value={pickerVal} onChange={e => setPickerVal(e.target.value)} />
              <button className="btn-go" onClick={applyTime}>Go ⚡</button>
              <button className="btn-cancel" style={{padding:"7px 12px",fontSize:12}} onClick={() => setShowPicker(false)}>Cancel</button>
            </div>
          )}

          {sprintActive && (
            <div className="budget-wrap">
              <div className="budget-bar"><div className={`budget-fill${budgetOver?" over":""}`} style={{width:budgetPct+"%"}}/></div>
              <div className="budget-text"><strong>{usedMins}min</strong> assigned · <strong>{Math.round(diffMins)}min</strong> left</div>
            </div>
          )}
        </div>

        {/* TASK LIST */}
        <div className="task-list">
          {loading && <div className="loading-state">Loading…</div>}
          {!loading && tasks.length === 0 && (
            <div className="empty-state">
              No tasks yet.<br/>
              Type one below, pick from your task pool,<br/>or pull from Trello ↓
            </div>
          )}

          {todo.map(task => (
            <SwipeDelete key={task.id} onDelete={() => deleteTask(task.id)}>
              <div className={`task-card${task.id===activeId?" active":""}`}>
                <div style={{flex:1,minWidth:0}}>
                  <div className="task-name">{task.name}</div>
                  <div className="task-meta">
                    {task.estimated_slots === 0
                      ? <span style={{color:"var(--orange)"}}>unestimated · tap start to begin</span>
                      : `${task.estimated_slots} × ${task.slot_minutes}min`}
                    {task.trello_list && <span style={{marginLeft:6,opacity:.6}}>· {task.trello_list}</span>}
                  </div>
                </div>
                {task.id===activeId
                  ? <span className="active-tag">ACTIVE</span>
                  : <button className="btn-start" onClick={()=>startTask(task)}>START</button>}
              </div>
            </SwipeDelete>
          ))}

          {partial.length > 0 && (
            <>
              <div className="section-label">⚠️ Interrupted</div>
              {partial.map(task => (
                <SwipeDelete key={task.id} onDelete={() => deleteTask(task.id)}>
                  <div className="task-card partial">
                    <div style={{flex:1,minWidth:0}}>
                      <div className="task-name">🔄 {task.name}</div>
                      <div className="task-meta"><span className="partial-tag">~{task.remaining_mins}min left</span></div>
                    </div>
                    <button className="btn-start" onClick={()=>startTask(task)}>RESUME</button>
                  </div>
                </SwipeDelete>
              ))}
            </>
          )}

          {done.length > 0 && (
            <>
              <div className="section-label">✓ Done</div>
              {done.map(task => (
                <div key={task.id} className="task-card done-card">
                  <span className="done-tick">✓</span>
                  <span className="task-name done-name">{task.name}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ADD STRIP */}
        <div className="add-strip">
          <div className="add-row">
            <input
              className="input-task"
              value={taskInput}
              onChange={e => setTaskInput(e.target.value)}
              onKeyDown={e => e.key==="Enter"&&addTask()}
              placeholder="Type a task…"
              autoComplete="off"
            />
            <div className="slot-controls-inline">
              <div className="slot-toggle-sm">
                <button className={slotMins===5?"on":""} onClick={()=>setSlotMins(5)}>5m</button>
                <button className={slotMins===15?"on":""} onClick={()=>setSlotMins(15)}>15m</button>
              </div>
              <button className="slot-step" onClick={()=>setSlotCount(s=>Math.max(1,s-1))}>−</button>
              <span className="slot-val">{slotCount}</span>
              <span className="slot-unit">{slotCount*slotMins}m</span>
              <button className="slot-step" onClick={()=>setSlotCount(s=>Math.min(24,s+1))}>+</button>
            </div>
            <button className="btn-add-task" onClick={()=>addTask()}>Add</button>
          </div>
          <div className="source-btns">
            <button className="btn-source" onClick={()=>setPoolOpen(true)}>🗂 Task pool</button>
            <button className="btn-source" onClick={openTrello}>⟳ Trello{syncStatus&&<span style={{color:"var(--orange)",marginLeft:4}}>{syncStatus}</span>}</button>
          </div>
        </div>

        {/* TASK POOL SHEET */}
        <div className={`backdrop${poolOpen?"":" off"}`} onClick={e=>e.target===e.currentTarget&&setPoolOpen(false)}>
          <div className="sheet">
            <div className="sheet-title">🗂 Task pool</div>
            <div className="sheet-sub">Tap tasks to add to your sprint</div>
            {QUICK_TASKS.map(cat => (
              <div key={cat.category}>
                <div className="cat-label">{cat.category}</div>
                {cat.tasks.map(t => (
                  <div key={t.name} className="quick-task-row" onClick={()=>toggleQuick(t.name)}>
                    <span className="quick-task-name">{t.name}</span>
                    <span className="quick-task-time">{t.slots > 1 ? `${t.slots} × ` : ""}{t.mins}min</span>
                    <div className={`qt-check${selectedQuick[t.name]?" on":""}`}>{selectedQuick[t.name]?"✓":""}</div>
                  </div>
                ))}
              </div>
            ))}
            <div className="sheet-actions">
              <button className="btn-cancel" onClick={()=>{setPoolOpen(false);setSelectedQuick({});}}>Cancel</button>
              <button className="btn-confirm" onClick={addQuickTasks}>
                Add {Object.values(selectedQuick).filter(Boolean).length || ""} tasks
              </button>
            </div>
          </div>
        </div>

        {/* TRELLO SHEET */}
        <div className={`backdrop${trelloOpen?"":" off"}`} onClick={e=>e.target===e.currentTarget&&setTrelloOpen(false)}>
          <div className="sheet">
            <div className="sheet-title">⟳ Pull from Trello</div>
            <div className="sheet-sub">Tap cards to add to your sprint</div>
            {trelloLoading && <div className="loading-state">Loading your Trello board…</div>}
            {!trelloLoading && trelloCards.map(card => (
              <div key={card.id} className="trello-card-row" onClick={()=>setTrelloSelected(p=>({...p,[card.id]:!p[card.id]}))}>
                <div className={`qt-check${trelloSelected[card.id]?" on":""}`}>{trelloSelected[card.id]?"✓":""}</div>
                <span style={{flex:1,fontSize:13,fontWeight:500}}>{card.name}</span>
                <span className="trello-list-tag">{card.listName}</span>
              </div>
            ))}
            <div className="sheet-actions">
              <button className="btn-cancel" onClick={()=>setTrelloOpen(false)}>Cancel</button>
              <button className="btn-confirm" onClick={addTrelloTasks}>
                Add {Object.values(trelloSelected).filter(Boolean).length || ""} tasks
              </button>
            </div>
          </div>
        </div>

        {/* TIMER OVERLAY */}
        <div className={`timer-overlay${activeId?"":" off"}`}>
          <div className="timer-task-name">{activeTask?.name}</div>
          <div className="timer-slot-info">slot {activeTask?.actual_slots} · {activeTask?.slot_minutes}min</div>
          <div className="ring-wrap">
            <svg viewBox="0 0 100 100">
              <circle className="ring-bg" cx="50" cy="50" r="44"/>
              <circle className={`ring-prog${secsLeft<60?" urgent":""}`} cx="50" cy="50" r="44" strokeDasharray="276.46" strokeDashoffset={ringOffset}/>
            </svg>
            <div className="ring-digits">{fmtSecs(secsLeft)}</div>
          </div>
          <div className="timer-btns">
            <button className="btn-more" onClick={addMoreTime}>+slot<br/><span style={{fontSize:10,color:"#888"}}>more time</span></button>
            <button className="btn-done-t" onClick={completeTask}>Done ✓</button>
          </div>
          <button className="btn-interrupt" onClick={markInterrupted}>⚠️ Got interrupted</button>
          <div className="quick-capture">
            <div className="qc-label">💡 Jot a task — stay focused</div>
            <div className="qc-row">
              <input className="qc-input" value={qcInput} onChange={e=>setQcInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&quickCapture()} placeholder="New task to remember…"/>
              <button className="btn-qc" onClick={quickCapture}>Add</button>
            </div>
            {qcMsg && <div className="qc-confirm">{qcMsg}</div>}
          </div>
        </div>

        {/* ALARM */}
        <div className={`alarm-overlay${alarmOn?" on":" off"}`}>
          <div className="alarm-title">⏰ Slot done!</div>
          <div className="alarm-sub">"{activeTask?.name}" — what's the situation?</div>
          <div className="alarm-btns">
            <button className="btn-a-done"      onClick={completeTask}>Done ✓</button>
            <button className="btn-a-more"      onClick={addMoreTime}>+slot — still going</button>
            <button className="btn-a-interrupt" onClick={markInterrupted}>⚠️ Got interrupted</button>
          </div>
        </div>

      </div>
    </>
  );
}
