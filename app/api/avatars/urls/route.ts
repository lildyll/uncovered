import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let roomId: unknown;
  try { ({ roomId } = await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof roomId !== 'string' || !/^[0-9a-f-]{36}$/i.test(roomId)) {
    return NextResponse.json({ error: 'Invalid room' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return NextResponse.json({ error: 'Avatar service is not configured' }, { status: 503 });

  const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Service role is server-only. Never expose this client or key to browser code.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: membership, error: membershipError } = await admin.from('players')
    .select('id').eq('room_id', roomId).eq('user_id', user.id).limit(1);
  if (membershipError) return NextResponse.json({ error: 'Could not verify membership' }, { status: 500 });
  if (!membership?.length) return NextResponse.json({ error: 'Not a room member' }, { status: 403 });

  const { data: players, error: playersError } = await admin.from('players')
    .select('id, photo_path').eq('room_id', roomId);
  if (playersError) return NextResponse.json({ error: 'Could not load avatars' }, { status: 500 });

  const urls: Record<string, string> = {};
  await Promise.all((players || []).map(async (player) => {
    if (!player.photo_path) return;
    const { data } = await admin.storage.from('player-avatars').createSignedUrl(player.photo_path, 600);
    if (data?.signedUrl) urls[player.id] = data.signedUrl;
  }));
  return NextResponse.json({ urls }, { headers: { 'Cache-Control': 'no-store' } });
}
