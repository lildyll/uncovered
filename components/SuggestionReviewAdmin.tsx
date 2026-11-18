"use client";
import { useState } from "react";
import { Check, RefreshCw, X, Pencil, Save } from "lucide-react";

type Suggestion = {
 id: string; game: "party" | "spicy"; type: string; prompt: string;
 option_one: string | null; option_two: string | null; status: "pending" | "approved" | "denied"; created_at: string;
};
export default function SuggestionReviewAdmin({ password }: { password: string }) {
 const [items, setItems] = useState<Suggestion[]>([]);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [message, setMessage] = useState("");
 const [editing, setEditing] = useState<string | null>(null);
 const [draft, setDraft] = useState({ prompt: "", option_one: "", option_two: "" });
 const [showReviewed, setShowReviewed] = useState(false);
 async function request(method: "GET" | "PATCH", body?: unknown) {
  const response = await fetch("/api/admin/suggestions", { method, headers: { "Content-Type": "application/json", "x-admin-password": password }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed"); return data;
 }
 async function load() {
  if (!password) return; setBusy(true); setError("");
  try { const data = await request("GET"); setItems(data.suggestions || []); }
  catch (e) { setError(e instanceof Error ? e.message : "Could not load suggestions"); }
  finally { setBusy(false); }
 }
 async function action(id: string, operation: "approve" | "deny" | "edit") {
  if (busy) return;
  if (operation === "deny" && !window.confirm("Deny this suggestion?")) return;
  setBusy(true); setError(""); setMessage("");
  try { await request("PATCH", { id, action: operation, ...(operation === "edit" ? draft : {}) });
   setMessage(operation === "approve" ? "Approved and added to the question library." : operation === "deny" ? "Suggestion denied." : "Suggestion updated.");
   setEditing(null); const data = await request("GET"); setItems(data.suggestions || []);
  } catch (e) { setError(e instanceof Error ? e.message : "Could not review suggestion"); }
  finally { setBusy(false); }
 }
 const visible = items.filter(i => showReviewed || i.status === "pending");
 return <section className="mt-6 rounded-[36px] border border-white/50 bg-white/70 p-6 shadow-2xl backdrop-blur-md">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="text-2xl font-black text-slate-800">Question Suggestions</h2><p className="mt-1 text-sm font-bold text-sky-700">{items.filter(i => i.status === "pending").length} pending review</p></div>
   <button type="button" disabled={!password || busy} onClick={load} className="flex items-center gap-2 rounded-2xl bg-sky-100 px-4 py-3 font-bold text-blue-700 disabled:opacity-50"><RefreshCw className="h-4 w-4" />{busy ? "Working..." : "Load Suggestions"}</button>
  </div>
  <label className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={showReviewed} onChange={e => setShowReviewed(e.target.checked)} /> Show approved and denied</label>
  <div className="mt-5 grid gap-3 lg:grid-cols-2">
   {visible.map(item => <article key={item.id} className="min-w-0 rounded-3xl bg-white p-5 shadow-md">
    <p className="text-xs font-black uppercase tracking-wide text-sky-500">{item.game === "party" ? "Party Mode" : "Spicy"} · {item.type.replaceAll("_", " ")} · {item.status}</p>
    {editing === item.id ? <div className="mt-3 space-y-3">
      <textarea aria-label="Edit question" rows={4} maxLength={500} value={draft.prompt} onChange={e => setDraft({ ...draft, prompt: e.target.value })} className="w-full rounded-xl border p-3 font-bold" />
      {item.type === "would_you_rather" && <><input aria-label="Edit option one" value={draft.option_one} onChange={e => setDraft({ ...draft, option_one: e.target.value })} className="w-full rounded-xl border p-3" /><input aria-label="Edit option two" value={draft.option_two} onChange={e => setDraft({ ...draft, option_two: e.target.value })} className="w-full rounded-xl border p-3" /></>}
      <div className="flex gap-2"><button disabled={busy} onClick={() => action(item.id, "edit")} className="flex items-center gap-1 rounded-xl bg-sky-500 px-4 py-2 font-bold text-white"><Save className="h-4 w-4" />Save</button><button onClick={() => setEditing(null)} className="rounded-xl bg-slate-100 px-4 py-2 font-bold">Cancel</button></div>
     </div> : <><p className="mt-2 break-words font-black text-slate-800">{item.prompt}</p>{item.option_one && <p className="mt-2 text-sm font-bold text-slate-500">{item.option_one} / {item.option_two}</p>}</>}
    {item.status === "pending" && editing !== item.id && <div className="mt-4 flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => action(item.id,"approve")} className="flex items-center gap-1 rounded-xl bg-emerald-100 px-3 py-2 font-bold text-emerald-700"><Check className="h-4 w-4" />Approve</button>
      <button disabled={busy} onClick={() => { setEditing(item.id); setDraft({ prompt: item.prompt, option_one: item.option_one || "", option_two: item.option_two || "" }); }} className="flex items-center gap-1 rounded-xl bg-sky-100 px-3 py-2 font-bold text-blue-700"><Pencil className="h-4 w-4" />Edit</button>
      <button disabled={busy} onClick={() => action(item.id,"deny")} className="flex items-center gap-1 rounded-xl bg-red-100 px-3 py-2 font-bold text-red-600"><X className="h-4 w-4" />Deny</button>
     </div>}
   </article>)}
   {visible.length === 0 && <p className="py-5 font-bold text-slate-500">No suggestions to display.</p>}
  </div>
  {message && <p role="status" className="mt-4 font-bold text-emerald-700">{message}</p>}
  {error && <p role="alert" className="mt-4 font-bold text-red-600">{error}</p>}
 </section>;
}
