"use client";

import { useState } from "react";

type Result = { dryRun: boolean; scanned: number; unused: number; deleted: number; paths?: string[]; warnings?: string[] };

export default function AvatarCleanupAdmin({ password }: { password: string }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Result | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function run(dryRun: boolean) {
    if (!password || busy) return;
    if (!dryRun && !window.confirm(`Delete ${preview?.unused ?? 0} unused photos older than 24 hours?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/avatar-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ dryRun }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cleanup failed.");
      if (dryRun) { setPreview(data); setResult(null); }
      else { setResult(data); setPreview(null); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cleanup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-[36px] border border-white/50 bg-white/70 p-6 shadow-xl dark:border-slate-600 dark:bg-slate-900/85">
      <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">Photo Storage Cleanup</h2>
      <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
        Only photos older than 24 hours that are not linked to any player can be deleted.
      </p>
      <button type="button" disabled={!password || busy} onClick={() => run(true)}
        className="mt-4 rounded-2xl bg-sky-500 px-5 py-3 font-black text-white disabled:opacity-50">
        {busy ? "Checking..." : "Check Unused Photos"}
      </button>
      {preview && (
        <div className="mt-4 text-slate-700 dark:text-slate-200">
          <p className="font-bold">Scanned {preview.scanned} photos. Found {preview.unused} eligible for cleanup.</p>
          {preview.unused > 0 && (
            <button type="button" disabled={busy} onClick={() => run(false)}
              className="mt-3 rounded-2xl bg-red-500 px-5 py-3 font-black text-white disabled:opacity-50">
              Delete Unused Photos
            </button>
          )}
        </div>
      )}
      {result && <p className="mt-4 font-bold text-emerald-600">Deleted {result.deleted} photos. {result.warnings?.length ? `${result.warnings.length} errors; check server logs.` : "Cleanup complete."}</p>}
      {error && <p role="alert" className="mt-4 font-bold text-red-500">{error}</p>}
    </section>
  );
}
