import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── ENV ───────────────────────────────────────────────────────────
const CLIENT_ID     = Deno.env.get("GOOGLE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const REDIRECT_URI  = Deno.env.get("GOOGLE_REDIRECT_URI")!;
const CALENDAR_IDS  = (Deno.env.get("GOOGLE_CALENDAR_IDS") || "").split(",").map(s => s.trim());
const APP_URL       = Deno.env.get("APP_URL")!;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CORS ──────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── TOKEN HELPERS ─────────────────────────────────────────────────
async function getStoredTokens() {
  const { data } = await supabase
    .from("google_tokens")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to refresh token");

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Update stored token
  await supabase
    .from("google_tokens")
    .update({ access_token: data.access_token, expires_at: expiresAt })
    .eq("refresh_token", refreshToken);

  return data.access_token;
}

async function getValidAccessToken() {
  const tokens = await getStoredTokens();
  if (!tokens) throw new Error("NOT_CONNECTED");

  const isExpired = new Date(tokens.expires_at) < new Date(Date.now() + 60000);
  if (isExpired) return await refreshAccessToken(tokens.refresh_token);
  return tokens.access_token;
}

// ── EVENT SEQUENCES ───────────────────────────────────────────────
// Maps calendar event keywords to suggested prep tasks
const EVENT_SEQUENCES: Record<string, { name: string; slotMinutes: number; slots: number }[]> = {
  gym: [
    { name: "Pack gym bag",    slotMinutes: 5,  slots: 1 },
    { name: "Drive to gym",    slotMinutes: 15, slots: 1 },
    { name: "Drive home",      slotMinutes: 15, slots: 1 },
    { name: "Shower & change", slotMinutes: 15, slots: 1 },
  ],
  "school run": [
    { name: "Get kids ready",  slotMinutes: 15, slots: 1 },
    { name: "Drive to school", slotMinutes: 15, slots: 1 },
    { name: "Drive home",      slotMinutes: 15, slots: 1 },
  ],
  "pick up": [
    { name: "Drive there",     slotMinutes: 15, slots: 1 },
    { name: "Drive home",      slotMinutes: 15, slots: 1 },
  ],
  dentist: [
    { name: "Drive to dentist", slotMinutes: 15, slots: 1 },
    { name: "Drive home",       slotMinutes: 15, slots: 1 },
  ],
  doctor: [
    { name: "Drive to doctor",  slotMinutes: 15, slots: 1 },
    { name: "Drive home",       slotMinutes: 15, slots: 1 },
  ],
  meeting: [
    { name: "Prepare for meeting", slotMinutes: 15, slots: 1 },
  ],
  supermarket: [
    { name: "Write shopping list", slotMinutes: 5,  slots: 1 },
    { name: "Drive to shop",       slotMinutes: 15, slots: 1 },
    { name: "Do the shop",         slotMinutes: 15, slots: 2 },
    { name: "Drive home",          slotMinutes: 15, slots: 1 },
    { name: "Unpack & put away",   slotMinutes: 15, slots: 1 },
  ],
  haircut: [
    { name: "Drive to hairdresser", slotMinutes: 15, slots: 1 },
    { name: "Drive home",           slotMinutes: 15, slots: 1 },
  ],
};

function detectEventSequence(eventTitle: string) {
  const lower = eventTitle.toLowerCase();
  for (const [keyword, tasks] of Object.entries(EVENT_SEQUENCES)) {
    if (lower.includes(keyword)) return { keyword, tasks };
  }
  return null;
}

// ── FETCH CALENDAR EVENTS ─────────────────────────────────────────
async function fetchWeekEvents(accessToken: string) {
  const now     = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const timeMin = now.toISOString();
  const timeMax = weekEnd.toISOString();

  const allEvents: object[] = [];

  for (const calendarId of CALENDAR_IDS) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
      new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy:      "startTime",
        maxResults:   "50",
      });

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) continue;
    const data = await res.json();
    const events = (data.items || []).map((e: any) => ({
      id:           e.id,
      title:        e.summary || "Untitled",
      start:        e.start?.dateTime || e.start?.date,
      end:          e.end?.dateTime   || e.end?.date,
      calendarId,
      allDay:       !e.start?.dateTime,
      sequence:     detectEventSequence(e.summary || ""),
    }));
    allEvents.push(...events);
  }

  // Sort by start time
  allEvents.sort((a: any, b: any) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  return allEvents;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url    = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── AUTH: Start Google OAuth flow ────────────────────────────
  if (action === "auth") {
    const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id:     CLIENT_ID,
        redirect_uri:  REDIRECT_URI,
        response_type: "code",
        scope:         "https://www.googleapis.com/auth/calendar.readonly",
        access_type:   "offline",
        prompt:        "consent",
      });

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: authUrl },
    });
  }

  // ── CALLBACK: Exchange code for tokens ───────────────────────
  if (action === "callback" || url.searchParams.get("code")) {
    const code = url.searchParams.get("code");
    if (!code) {
      return new Response("Missing code", { status: 400, headers: corsHeaders });
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return new Response(JSON.stringify({ error: "Token exchange failed", details: tokens }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Delete old tokens and store new ones
    await supabase.from("google_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("google_tokens").insert([{
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
    }]);

    // Redirect back to app with success flag
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: `${APP_URL}?calendar=connected` },
    });
  }

  // ── EVENTS: Fetch this week's calendar events ─────────────────
  if (action === "events") {
    try {
      const accessToken = await getValidAccessToken();
      const events      = await fetchWeekEvents(accessToken);

      return new Response(JSON.stringify({ events }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      if (err.message === "NOT_CONNECTED") {
        return new Response(JSON.stringify({ error: "NOT_CONNECTED" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ── STATUS: Check if calendar is connected ────────────────────
  if (action === "status") {
    const tokens = await getStoredTokens();
    return new Response(JSON.stringify({ connected: !!tokens }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});