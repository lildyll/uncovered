import { createClient } from "@supabase/supabase-js";

const BUCKET = "player-avatars";
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_FILES = 10000;

type StorageEntry = { name: string; id?: string | null; created_at?: string | null };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server configuration.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function cleanupOrphanAvatars(dryRun: boolean) {
  const admin = adminClient();
  const referenced = new Set<string>();

  // Read ALL player references before considering any deletion. Fail closed on errors.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin.from("players")
      .select("photo_path").not("photo_path", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Cannot read player references: ${error.message}`);
    for (const player of data || []) {
      if (typeof player.photo_path === "string") referenced.add(player.photo_path);
    }
    if ((data || []).length < PAGE_SIZE) break;
  }

  // Supabase Storage list() is folder-scoped, so traverse folders and paginate.
  const candidates: string[] = [];
  let scanned = 0;
  const cutoff = Date.now() - MIN_AGE_MS;
  const folders = [""];
  const visited = new Set<string>();
  while (folders.length) {
    const folder = folders.shift()!;
    if (visited.has(folder)) continue;
    visited.add(folder);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.storage.from(BUCKET)
        .list(folder, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`Cannot list Storage folder ${folder}: ${error.message}`);
      const entries = (data || []) as StorageEntry[];
      for (const entry of entries) {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        if (!entry.id) {
          folders.push(path);
          continue;
        }
        scanned++;
        if (scanned > MAX_FILES) throw new Error("Too many avatar files to safely scan in one run.");
        const created = entry.created_at ? Date.parse(entry.created_at) : NaN;
        if (!Number.isFinite(created) || created > cutoff || referenced.has(path)) continue;
        candidates.push(path);
      }
      if (entries.length < PAGE_SIZE) break;
    }
  }

  if (dryRun) return { dryRun: true, scanned, unused: candidates.length, deleted: 0, paths: candidates.slice(0, 50) };

  // Recheck references just before deletion to reduce races with newly created players.
  let deleted = 0;
  const warnings: string[] = [];
  for (const path of candidates) {
    const { count, error: referenceError } = await admin.from("players")
      .select("id", { count: "exact", head: true }).eq("photo_path", path);
    if (referenceError) throw new Error(`Cannot recheck photo references: ${referenceError.message}`);
    if ((count || 0) !== 0) continue;
    const { data, error } = await admin.storage.from(BUCKET).remove([path]);
    if (error) warnings.push(`${path}: ${error.message}`);
    else if (data?.length) deleted++;
  }
  return { dryRun: false, scanned, unused: candidates.length, deleted, warnings };
}
