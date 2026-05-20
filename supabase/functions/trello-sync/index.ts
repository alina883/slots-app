import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TRELLO_KEY   = Deno.env.get("TRELLO_API_KEY")!;
const TRELLO_TOKEN = Deno.env.get("TRELLO_TOKEN")!;
const BOARD_ID     = Deno.env.get("TRELLO_BOARD_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function labelToBucket(labels: any[]): string {
  if (!labels?.length) return "HOME";
  const name = labels[0].name?.toLowerCase() || "";
  if (name.includes("health") || name.includes("personal") || name.includes("self")) return "SELF";
  if (name.includes("content") || name.includes("work") || name.includes("molensa") || name.includes("business")) return "WORK";
  if (name.includes("must") || name.includes("admin") || name.includes("urgent")) return "ADMIN";
  return "HOME";
}

function getWeekDays() {
  const today = new Date();
  const day   = today.getDay();
  const mon   = new Date(today);
  mon.setDate(today.getDate() - ((day + 6) % 7));
  const days: Record<string, string> = {};
  const names = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"];
  names.forEach((n, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    days[n] = d.toISOString().slice(0, 10);
  });
  days["WEEKEND"] = days["SATURDAY"];
  return days;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const weekDays = getWeekDays();

    const listsRes = await fetch(`https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const lists    = await listsRes.json();

    const cardsRes = await fetch(`https://api.trello.com/1/boards/${BOARD_ID}/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}&fields=id,name,idList,labels,desc&filter=open`);
    const cards    = await cardsRes.json();

    const inboxRes  = await fetch(`https://api.trello.com/1/members/me/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}&fields=id,name,idList,labels,desc&filter=open`);
    const inboxCards = await inboxRes.json();

    const listMap: Record<string, string> = {};
    lists.forEach((l: any) => { listMap[l.id] = l.name.toUpperCase(); });

    const doneListIds = lists.filter((l: any) => l.name.toUpperCase() === "DONE").map((l: any) => l.id);

    const allCards = [...cards];
    inboxCards.forEach((c: any) => { if (!allCards.find((x: any) => x.id === c.id)) allCards.push(c); });

    const openCards = allCards.filter((c: any) => !doneListIds.includes(c.idList));

    const { data: existing } = await supabase.from("tasks").select("trello_card_id").not("trello_card_id", "is", null);
    const existingIds = new Set((existing || []).map((t: any) => t.trello_card_id));

    const toInsert = [];
    for (const card of openCards) {
      if (existingIds.has(card.id)) continue;
      const listName     = listMap[card.idList] || "";
      const bucket       = labelToBucket(card.labels);
      const scheduledDate = weekDays[listName] || null;

      toInsert.push({
        name: card.name, mode: "deadline", bucket,
        estimated_slots: 0, slot_minutes: 15,
        actual_slots: 0, done: false, partial: false,
        scheduled_date: scheduledDate,
        trello_card_id: card.id,
        trello_list: listName,
      });
    }

    if (!toInsert.length) {
      return new Response(JSON.stringify({ imported: 0, message: "No new cards to import" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.from("tasks").insert(toInsert).select();
    if (error) throw error;

    return new Response(JSON.stringify({ imported: data.length, tasks: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
