// Aturan isi public/data.json. Dipakai dua kali:
// 1. Render menjalankan `node check-data.mjs` sebelum deploy; kalau ada kesalahan, deploy dibatalkan.
// 2. Panel admin (admin/server.mjs) memanggil validate() sebelum menyimpan.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isNum = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function validate(data) {
  const err = [];
  if (!Array.isArray(data?.tenants) || !data.tenants.length) return ['Daftar tenant kosong'];
  const ids = new Set();
  for (const [i, t] of data.tenants.entries()) {
    const at = t?.name ? `Tenant "${t.name}"` : `Tenant ke-${i + 1}`;
    if (!/^[a-z0-9-]{2,40}$/.test(t?.id ?? '')) err.push(`${at}: id halaman hanya boleh huruf kecil, angka, dan tanda hubung`);
    else if (ids.has(t.id)) err.push(`${at}: id halaman "${t.id}" sudah dipakai tenant lain`);
    ids.add(t?.id);
    if (!t?.name?.trim()) err.push(`${at}: nama stan kosong`);
    if (!/^62\d{8,13}$/.test(t?.wa ?? '')) err.push(`${at}: nomor WhatsApp harus diawali 62, contoh 6281234567890`);
    if (!TIME.test(t?.open ?? '') || !TIME.test(t?.close ?? '')) err.push(`${at}: jam buka dan tutup harus format JJ:MM, contoh 07:00`);
    for (const [k, label] of [['minOrder', 'minimal pesanan'], ['radiusKm', 'jangkauan antar'], ['prepMin', 'waktu siap'], ['freeKm', 'batas gratis ongkir'], ['perKm', 'ongkir per km']])
      if (!isNum(t?.[k])) err.push(`${at}: ${label} harus angka`);
    if (!Array.isArray(t?.menu)) { err.push(`${at}: daftar menu tidak valid`); continue; }
    for (const [j, m] of t.menu.entries()) {
      const am = `${at}, menu ${m?.name ? `"${m.name}"` : `ke-${j + 1}`}`;
      if (!m?.name?.trim()) err.push(`${am}: nama menu kosong`);
      if (!Number.isInteger(m?.price) || m.price < 0) err.push(`${am}: harga harus angka bulat tanpa titik, contoh 15000`);
      if (!m?.unit?.trim()) err.push(`${am}: satuan kosong`);
    }
  }
  return err;
}

// Dijalankan langsung: node check-data.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let data;
  try { data = JSON.parse(readFileSync(new URL('./public/data.json', import.meta.url), 'utf8')); }
  catch (e) { console.error('data.json bukan JSON yang valid:\n' + e.message); process.exit(1); }
  const err = validate(data);
  if (err.length) { console.error(`data.json punya ${err.length} kesalahan:\n- ` + err.join('\n- ')); process.exit(1); }
  console.log(`data.json OK: ${data.tenants.length} tenant, ${data.tenants.reduce((s, t) => s + t.menu.length, 0)} menu`);
}
