import React, { useState, useEffect, useRef } from "react";
import { Camera, Plus, Home, List, Settings as SettingsIcon, X, Check, Pencil, Trash2, Flame, Droplet, TrendingUp, ChevronLeft, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { storage } from "./storage";

// ---------- constants ----------
const DEFAULT_GOAL = 25; // grams of sugar per day (illustrative default)
const COLORS = {
  bg: "#EFF3EC",
  card: "#FFFFFF",
  ink: "#1F2A24",
  inkSoft: "#5B6B60",
  line: "#DCE4DD",
  sage: "#3D6B4F",
  sageSoft: "#DCEAE0",
  rust: "#A8461F",
  rustSoft: "#F4E1D6",
  amber: "#B98A2E",
};

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDay = (d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];
const defaultMealType = () => {
  const h = new Date().getHours();
  if (h < 11) return "Breakfast";
  if (h < 15) return "Lunch";
  if (h < 20) return "Dinner";
  return "Snack";
};

// ---------- image compression ----------
function compressImage(file, maxWidth = 500, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- storage helpers ----------
async function loadIndex() {
  try {
    const r = await storage.get("entries:index");
    return r ? JSON.parse(r.value) : [];
  } catch {
    return [];
  }
}
async function saveIndex(list) {
  await storage.set("entries:index", JSON.stringify(list));
}
async function loadEntry(id) {
  try {
    const r = await storage.get(`entry:${id}`);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
}
async function saveEntry(entry) {
  await storage.set(`entry:${entry.id}`, JSON.stringify(entry));
}
async function deleteEntryStorage(id) {
  try {
    await storage.delete(`entry:${id}`);
  } catch {}
}
async function loadGoal() {
  try {
    const r = await storage.get("settings:goal");
    return r ? JSON.parse(r.value) : DEFAULT_GOAL;
  } catch {
    return DEFAULT_GOAL;
  }
}
async function saveGoal(g) {
  await storage.set("settings:goal", JSON.stringify(g));
}
async function loadApiKey() {
  try {
    const r = await storage.get("settings:apiKey");
    return r ? r.value : "";
  } catch {
    return "";
  }
}
async function saveApiKey(k) {
  await storage.set("settings:apiKey", k);
}

// ---------- Claude vision call ----------
async function analyzeFood(base64Image, apiKey) {
  if (!apiKey) throw new Error("Add your Anthropic API key in Settings first.");
  const media = base64Image.split(";")[0].split(":")[1];
  const data = base64Image.split(",")[1];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Required for direct browser calls to the Anthropic API (no backend proxy here).
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system:
        "You are a nutrition estimation assistant. Look at the food/drink photo and estimate its nutritional content. Respond with ONLY a raw JSON object, no markdown fences, no preamble, in exactly this shape: " +
        '{"foodName": string, "sugarG": number, "caloriesKcal": number, "carbsG": number, "confidence": "low"|"medium"|"high", "note": string}. ' +
        "The note field should be a very short (under 15 words) caveat about what could make this estimate off (e.g. hidden sauce, portion size uncertainty). Numbers are your best single estimate, not a range.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data } },
            { type: "text", text: "Estimate the sugar, calories, and carbs in this food/drink." },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("That API key was rejected. Double-check it in Settings.");
    throw new Error("Request to the analysis model failed.");
  }
  const json = await response.json();
  const textBlock = (json.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No response from the model.");
  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

// ---------- small UI atoms ----------
function StatPill({ icon: Icon, label, value, sub, tone = "sage" }) {
  const bg = tone === "sage" ? COLORS.sageSoft : tone === "rust" ? COLORS.rustSoft : "#F3EEDC";
  const fg = tone === "sage" ? COLORS.sage : tone === "rust" ? COLORS.rust : COLORS.amber;
  return (
    <div style={{ background: bg }} className="rounded-2xl p-4 flex flex-col gap-1 flex-1 min-w-0">
      <div className="flex items-center gap-1.5" style={{ color: fg }}>
        <Icon size={16} />
        <span className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums" style={{ color: COLORS.ink, fontFamily: "'Newsreader', serif" }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: COLORS.inkSoft }}>{sub}</div>}
    </div>
  );
}

function MealBadge({ mealType }) {
  if (!mealType) return null;
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ background: COLORS.sageSoft, color: COLORS.sage }}>
      {mealType}
    </span>
  );
}

function BottomNav({ view, setView }) {
  const items = [
    { id: "dashboard", icon: Home, label: "Today" },
    { id: "log", icon: List, label: "Log" },
    { id: "add", icon: Plus, label: "Add" },
    { id: "settings", icon: SettingsIcon, label: "Settings" },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pointer-events-none z-20">
      <div
        className="pointer-events-auto w-full max-w-md mx-3 mb-3 rounded-2xl flex justify-around py-2 px-2 shadow-lg"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.line}` }}
      >
        {items.map((it) => {
          const active = view === it.id || (view === "camera" && it.id === "add");
          return (
            <button
              key={it.id}
              onClick={() => setView(it.id)}
              className="flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-colors"
              style={{ color: active ? COLORS.sage : COLORS.inkSoft, background: active ? COLORS.sageSoft : "transparent" }}
            >
              <it.icon size={20} />
              <span className="text-[10px] font-medium">{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DateMealFields({ date, mealType, onDateChange, onMealChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Date</label>
        <input type="date" value={date} max={todayStr()} onChange={(e) => onDateChange(e.target.value)} className="w-full rounded-lg px-2 py-2 mt-1 tabular-nums" style={{ border: `1px solid ${COLORS.line}` }} />
      </div>
      <div>
        <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Meal</label>
        <select value={mealType} onChange={(e) => onMealChange(e.target.value)} className="w-full rounded-lg px-2 py-2 mt-1" style={{ border: `1px solid ${COLORS.line}` }}>
          {MEAL_TYPES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---------- main app ----------
export default function App() {
  const [view, setView] = useState("dashboard");
  const [index, setIndex] = useState([]);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [goalDraft, setGoalDraft] = useState(String(DEFAULT_GOAL));
  const [apiKey, setApiKey] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [detailEntry, setDetailEntry] = useState(null);
  const fileInputRef = useRef(null);

  // camera/add flow state
  const [pendingImage, setPendingImage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [draftResult, setDraftResult] = useState(null);

  useEffect(() => {
    (async () => {
      const [idx, g, k] = await Promise.all([loadIndex(), loadGoal(), loadApiKey()]);
      setIndex(idx);
      setGoal(g);
      setGoalDraft(String(g));
      setApiKey(k);
      setApiKeyDraft(k);
      setLoaded(true);
    })();
  }, []);

  const today = todayStr();
  const todayEntries = index.filter((e) => e.date === today);
  const todaySugar = todayEntries.reduce((s, e) => s + (e.sugarG || 0), 0);
  const todayCal = todayEntries.reduce((s, e) => s + (e.caloriesKcal || 0), 0);

  const streak = (() => {
    const byDate = {};
    index.forEach((e) => {
      byDate[e.date] = (byDate[e.date] || 0) + (e.sugarG || 0);
    });
    let count = 0;
    let cursor = new Date();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (byDate[key] === undefined) break;
      if (byDate[key] <= goal) {
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
    return count;
  })();

  const chartData = (() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const total = index.filter((e) => e.date === key).reduce((s, e) => s + (e.sugarG || 0), 0);
      days.push({ date: key, label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), sugar: Math.round(total * 10) / 10 });
    }
    return days;
  })();

  const resetAddFlow = () => {
    setPendingImage(null);
    setAnalyzing(false);
    setAnalysisError(null);
    setDraftResult(null);
  };

  const handleFile = async (file) => {
    if (!file) return;
    resetAddFlow();
    setView("camera");
    try {
      const compressed = await compressImage(file);
      setPendingImage(compressed);
      setAnalyzing(true);
      const result = await analyzeFood(compressed, apiKey);
      setDraftResult({
        foodName: result.foodName || "Unknown food",
        sugarG: Number(result.sugarG) || 0,
        caloriesKcal: Number(result.caloriesKcal) || 0,
        carbsG: Number(result.carbsG) || 0,
        confidence: result.confidence || "medium",
        note: result.note || "",
        date: today,
        mealType: defaultMealType(),
      });
    } catch (err) {
      setAnalysisError(err.message || "Couldn't analyze that photo. Try again or enter values manually.");
      setDraftResult({ foodName: "", sugarG: 0, caloriesKcal: 0, carbsG: 0, confidence: "low", note: "", date: today, mealType: defaultMealType() });
    } finally {
      setAnalyzing(false);
    }
  };

  const saveDraft = async () => {
    if (!draftResult) return;
    const entry = {
      id: uid(),
      time: new Date().toISOString(),
      image: pendingImage,
      ...draftResult,
      corrected: false,
    };
    await saveEntry(entry);
    const newIndexEntry = { id: entry.id, date: entry.date, mealType: entry.mealType, foodName: entry.foodName, sugarG: entry.sugarG, caloriesKcal: entry.caloriesKcal, carbsG: entry.carbsG };
    const newIndex = [newIndexEntry, ...index];
    setIndex(newIndex);
    await saveIndex(newIndex);
    resetAddFlow();
    setView("dashboard");
  };

  const openDetail = async (id) => {
    const e = await loadEntry(id);
    setDetailEntry(e);
  };

  const updateDetailField = (field, value) => {
    setDetailEntry((d) => ({ ...d, [field]: value }));
  };

  const saveDetail = async () => {
    if (!detailEntry) return;
    const updated = { ...detailEntry, corrected: true };
    await saveEntry(updated);
    const newIndex = index.map((e) =>
      e.id === updated.id
        ? { id: updated.id, date: updated.date, mealType: updated.mealType, foodName: updated.foodName, sugarG: Number(updated.sugarG), caloriesKcal: Number(updated.caloriesKcal), carbsG: Number(updated.carbsG) }
        : e
    );
    setIndex(newIndex);
    await saveIndex(newIndex);
    setDetailEntry(null);
  };

  const deleteEntryFlow = async (id) => {
    await deleteEntryStorage(id);
    const newIndex = index.filter((e) => e.id !== id);
    setIndex(newIndex);
    await saveIndex(newIndex);
    setDetailEntry(null);
  };

  const saveGoalFlow = async () => {
    const g = Math.max(1, Number(goalDraft) || DEFAULT_GOAL);
    setGoal(g);
    await saveGoal(g);
  };

  const saveApiKeyFlow = async () => {
    setApiKey(apiKeyDraft);
    await saveApiKey(apiKeyDraft);
  };

  if (!loaded) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh" }} className="flex items-center justify-center">
        <Loader2 className="animate-spin" style={{ color: COLORS.sage }} size={28} />
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, fontFamily: "Inter, ui-sans-serif, system-ui", color: COLORS.ink, minHeight: "100vh" }}>
      <div className="max-w-md mx-auto pb-28 px-4 pt-6">
        {/* ---------- DASHBOARD ---------- */}
        {view === "dashboard" && (
          <>
            <div className="mb-5">
              <div className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
              <h1 style={{ fontFamily: "'Newsreader', serif" }} className="text-2xl font-semibold mt-0.5">Today's intake</h1>
            </div>

            <div className="flex gap-3 mb-4">
              <StatPill icon={Droplet} label="Sugar" value={`${Math.round(todaySugar * 10) / 10}g`} sub={`goal ${goal}g`} tone={todaySugar > goal ? "rust" : "sage"} />
              <StatPill icon={Flame} label="Calories" value={Math.round(todayCal)} sub="today" tone="amber" />
              <StatPill icon={TrendingUp} label="Streak" value={streak} sub="days under goal" tone="sage" />
            </div>

            {!apiKey && (
              <div className="rounded-xl p-3 mb-4 flex items-start gap-2 text-sm" style={{ background: "#F3EEDC", color: COLORS.amber }}>
                <KeyRound size={16} className="mt-0.5 shrink-0" />
                <span>Add your Anthropic API key in Settings to enable photo analysis.</span>
              </div>
            )}

            {todaySugar > goal && (
              <div className="rounded-xl p-3 mb-4 flex items-start gap-2 text-sm" style={{ background: COLORS.rustSoft, color: COLORS.rust }}>
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>You're {Math.round((todaySugar - goal) * 10) / 10}g over your sugar goal today.</span>
              </div>
            )}

            <div className="rounded-2xl p-4 mb-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.line}` }}>
              <div className="text-sm font-medium mb-3" style={{ color: COLORS.inkSoft }}>Sugar, last 14 days</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={COLORS.line} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: COLORS.inkSoft }} interval={2} axisLine={{ stroke: COLORS.line }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: COLORS.inkSoft }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, fontSize: 12 }} />
                  <ReferenceLine y={goal} stroke={COLORS.rust} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="sugar" stroke={COLORS.sage} strokeWidth={2.5} dot={{ r: 2.5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="text-sm font-medium mb-2" style={{ color: COLORS.inkSoft }}>Today's entries</div>
            {todayEntries.length === 0 && (
              <div className="text-sm rounded-xl p-4 text-center" style={{ background: COLORS.card, color: COLORS.inkSoft, border: `1px dashed ${COLORS.line}` }}>
                Nothing logged yet — tap Add to photograph your next meal.
              </div>
            )}
            <div className="flex flex-col gap-2">
              {todayEntries.map((e) => (
                <button key={e.id} onClick={() => openDetail(e.id)} className="rounded-xl p-3 flex items-center justify-between text-left" style={{ background: COLORS.card, border: `1px solid ${COLORS.line}` }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{e.foodName}</div>
                      <MealBadge mealType={e.mealType} />
                    </div>
                    <div className="text-xs" style={{ color: COLORS.inkSoft }}>{Math.round(e.sugarG * 10) / 10}g sugar · {Math.round(e.caloriesKcal)} kcal</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---------- LOG (all history) ---------- */}
        {view === "log" && (
          <>
            <h1 style={{ fontFamily: "'Newsreader', serif" }} className="text-2xl font-semibold mb-4">Full log</h1>
            {index.length === 0 && (
              <div className="text-sm rounded-xl p-4 text-center" style={{ background: COLORS.card, color: COLORS.inkSoft, border: `1px dashed ${COLORS.line}` }}>
                No entries yet.
              </div>
            )}
            <div className="flex flex-col gap-2">
              {index.map((e) => (
                <button key={e.id} onClick={() => openDetail(e.id)} className="rounded-xl p-3 flex items-center justify-between text-left" style={{ background: COLORS.card, border: `1px solid ${COLORS.line}` }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{e.foodName}</div>
                      <MealBadge mealType={e.mealType} />
                    </div>
                    <div className="text-xs" style={{ color: COLORS.inkSoft }}>{fmtDay(e.date)} · {Math.round(e.sugarG * 10) / 10}g sugar · {Math.round(e.caloriesKcal)} kcal</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---------- SETTINGS ---------- */}
        {view === "settings" && (
          <>
            <h1 style={{ fontFamily: "'Newsreader', serif" }} className="text-2xl font-semibold mb-4">Settings</h1>

            <div className="rounded-2xl p-4 mb-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.line}` }}>
              <label className="text-sm font-medium" style={{ color: COLORS.inkSoft }}>Anthropic API key</label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{ border: `1px solid ${COLORS.line}`, background: COLORS.bg }}
                />
                <button onClick={saveApiKeyFlow} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: COLORS.sage }}>Save</button>
              </div>
              <p className="text-xs mt-3" style={{ color: COLORS.inkSoft }}>
                Stored only in this browser's local storage and sent directly to Anthropic when you analyze a photo — it never touches any server of ours. Get a key at{" "}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="underline" style={{ color: COLORS.sage }}>console.anthropic.com</a>.
                Since this is a public static site, don't share your deployed URL with your key pre-filled — each person should enter their own.
              </p>
            </div>

            <div className="rounded-2xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.line}` }}>
              <label className="text-sm font-medium" style={{ color: COLORS.inkSoft }}>Daily sugar goal (grams)</label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-lg tabular-nums"
                  style={{ border: `1px solid ${COLORS.line}`, background: COLORS.bg }}
                />
                <button onClick={saveGoalFlow} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: COLORS.sage }}>Save</button>
              </div>
              <p className="text-xs mt-3" style={{ color: COLORS.inkSoft }}>Used to calculate your daily streak and the trend line's reference marker. This is a personal target, not medical guidance — check with a clinician for a number that fits your health needs.</p>
            </div>
          </>
        )}

        {/* ---------- CAMERA / ADD FLOW ---------- */}
        {view === "camera" && (
          <>
            <button onClick={() => { resetAddFlow(); setView("dashboard"); }} className="flex items-center gap-1 text-sm mb-3" style={{ color: COLORS.inkSoft }}>
              <ChevronLeft size={16} /> Cancel
            </button>
            <h1 style={{ fontFamily: "'Newsreader', serif" }} className="text-2xl font-semibold mb-4">Log a food photo</h1>

            {!pendingImage && (
              <div className="flex flex-col gap-3">
                <label className="rounded-2xl flex flex-col items-center justify-center gap-2 py-12 cursor-pointer" style={{ background: COLORS.card, border: `2px dashed ${COLORS.line}` }}>
                  <Camera size={28} style={{ color: COLORS.sage }} />
                  <span className="text-sm font-medium">Take or choose a photo</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                </label>
              </div>
            )}

            {pendingImage && (
              <div className="flex flex-col gap-3">
                <img src={pendingImage} alt="food" className="rounded-2xl w-full object-cover" style={{ maxHeight: 260 }} />

                {analyzing && (
                  <div className="flex items-center gap-2 justify-center py-6 text-sm" style={{ color: COLORS.inkSoft }}>
                    <Loader2 className="animate-spin" size={18} /> Estimating sugar and calories…
                  </div>
                )}

                {analysisError && (
                  <div className="rounded-xl p-3 flex items-start gap-2 text-sm" style={{ background: COLORS.rustSoft, color: COLORS.rust }}>
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{analysisError}</span>
                  </div>
                )}

                {draftResult && !analyzing && (
                  <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.line}` }}>
                    {draftResult.note && (
                      <div className="text-xs rounded-lg p-2" style={{ background: COLORS.sageSoft, color: COLORS.sage }}>
                        Estimate ({draftResult.confidence} confidence): {draftResult.note}
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Food</label>
                      <input value={draftResult.foodName} onChange={(e) => setDraftResult({ ...draftResult, foodName: e.target.value })} className="w-full rounded-lg px-3 py-2 mt-1" style={{ border: `1px solid ${COLORS.line}` }} />
                    </div>
                    <DateMealFields
                      date={draftResult.date}
                      mealType={draftResult.mealType}
                      onDateChange={(v) => setDraftResult({ ...draftResult, date: v })}
                      onMealChange={(v) => setDraftResult({ ...draftResult, mealType: v })}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Sugar (g)</label>
                        <input type="number" value={draftResult.sugarG} onChange={(e) => setDraftResult({ ...draftResult, sugarG: Number(e.target.value) })} className="w-full rounded-lg px-2 py-2 mt-1 tabular-nums" style={{ border: `1px solid ${COLORS.line}` }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Calories</label>
                        <input type="number" value={draftResult.caloriesKcal} onChange={(e) => setDraftResult({ ...draftResult, caloriesKcal: Number(e.target.value) })} className="w-full rounded-lg px-2 py-2 mt-1 tabular-nums" style={{ border: `1px solid ${COLORS.line}` }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Carbs (g)</label>
                        <input type="number" value={draftResult.carbsG} onChange={(e) => setDraftResult({ ...draftResult, carbsG: Number(e.target.value) })} className="w-full rounded-lg px-2 py-2 mt-1 tabular-nums" style={{ border: `1px solid ${COLORS.line}` }} />
                      </div>
                    </div>
                    <button onClick={saveDraft} className="rounded-lg py-2.5 text-sm font-medium text-white flex items-center justify-center gap-1.5" style={{ background: COLORS.sage }}>
                      <Check size={16} /> Save entry
                    </button>
                  </div>
                )}

                {analysisError && !analyzing && (
                  <button onClick={() => setPendingImage(null)} className="text-sm underline self-center" style={{ color: COLORS.inkSoft }}>Try a different photo</button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------- ENTRY DETAIL MODAL ---------- */}
      {detailEntry && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center" style={{ background: "rgba(31,42,36,0.4)" }} onClick={() => setDetailEntry(null)}>
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] overflow-y-auto" style={{ background: COLORS.card }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>{fmtDay(detailEntry.date)}</span>
              <button onClick={() => setDetailEntry(null)}><X size={20} style={{ color: COLORS.inkSoft }} /></button>
            </div>
            {detailEntry.image && <img src={detailEntry.image} alt={detailEntry.foodName} className="rounded-2xl w-full object-cover mb-3" style={{ maxHeight: 220 }} />}
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Food</label>
                <input value={detailEntry.foodName} onChange={(e) => updateDetailField("foodName", e.target.value)} className="w-full rounded-lg px-3 py-2 mt-1" style={{ border: `1px solid ${COLORS.line}` }} />
              </div>
              <DateMealFields
                date={detailEntry.date}
                mealType={detailEntry.mealType || defaultMealType()}
                onDateChange={(v) => updateDetailField("date", v)}
                onMealChange={(v) => updateDetailField("mealType", v)}
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Sugar (g)</label>
                  <input type="number" value={detailEntry.sugarG} onChange={(e) => updateDetailField("sugarG", Number(e.target.value))} className="w-full rounded-lg px-2 py-2 mt-1 tabular-nums" style={{ border: `1px solid ${COLORS.line}` }} />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Calories</label>
                  <input type="number" value={detailEntry.caloriesKcal} onChange={(e) => updateDetailField("caloriesKcal", Number(e.target.value))} className="w-full rounded-lg px-2 py-2 mt-1 tabular-nums" style={{ border: `1px solid ${COLORS.line}` }} />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: COLORS.inkSoft }}>Carbs (g)</label>
                  <input type="number" value={detailEntry.carbsG} onChange={(e) => updateDetailField("carbsG", Number(e.target.value))} className="w-full rounded-lg px-2 py-2 mt-1 tabular-nums" style={{ border: `1px solid ${COLORS.line}` }} />
                </div>
              </div>
              {detailEntry.note && <p className="text-xs" style={{ color: COLORS.inkSoft }}>Original AI note: {detailEntry.note}</p>}
              <div className="flex gap-2 mt-1">
                <button onClick={saveDetail} className="flex-1 rounded-lg py-2.5 text-sm font-medium text-white flex items-center justify-center gap-1.5" style={{ background: COLORS.sage }}>
                  <Pencil size={15} /> Save changes
                </button>
                <button onClick={() => deleteEntryFlow(detailEntry.id)} className="rounded-lg py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.rustSoft, color: COLORS.rust }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav
        view={view}
        setView={(v) => {
          if (v === "add") {
            resetAddFlow();
            setView("camera");
          } else {
            setView(v);
          }
        }}
      />
    </div>
  );
}
