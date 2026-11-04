import { supabase } from "@/lib/supabase";

export async function uploadPlayerAvatar(userId: string, file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Please choose an image under 10 MB.');

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot process the photo.');
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not resize photo.')), 'image/webp', 0.78));
    const path = `${userId}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage.from('player-avatars').upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    return path;
  } finally {
    bitmap.close();
  }
}
