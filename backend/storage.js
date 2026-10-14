import fs from 'fs';
import path from 'path';
import { FILES_DIR } from './config.js';

// Reemplazo local de driveService.js (Google Drive) del sistema original.
// Misma interfaz: createFolder(nombre) -> { id }, uploadFile(...) -> { id, webViewLink }.
// Cada depósito tiene su carpeta en data/archivos/<carpeta>/ y los archivos se sirven en
// /archivos/<carpeta>/<archivo>, que es lo que se guarda como "link" en la base.

// Quita caracteres no válidos en nombres de archivo de Windows.
export function sanitizeName(name) {
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, '_').slice(0, 150);
}

export function folderPath(folderId) {
  const p = path.resolve(FILES_DIR, sanitizeName(folderId));
  if (!p.startsWith(path.resolve(FILES_DIR))) throw new Error('Ruta inválida');
  return p;
}

export function fileUrl(folderId, fileName) {
  return `/archivos/${encodeURIComponent(folderId)}/${encodeURIComponent(fileName)}`;
}

/** Crea la carpeta del depósito. Si ya existe una con ese nombre, agrega un sufijo. */
export async function createFolder(folderName) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const base = sanitizeName(folderName);
  let id = base;
  let n = 2;
  while (fs.existsSync(folderPath(id))) id = `${base}_${n++}`;
  fs.mkdirSync(folderPath(id), { recursive: true });
  return { id, name: id };
}

/** Mueve un archivo temporal a la carpeta del depósito. No sobrescribe: si el nombre existe, numera. */
export async function uploadFile(tmpPath, fileName, _mimeType, folderId) {
  const dir = folderPath(folderId);
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(fileName);
  const stem = sanitizeName(path.basename(fileName, ext));
  let finalName = `${stem}${ext.toLowerCase()}`;
  let n = 2;
  while (fs.existsSync(path.join(dir, finalName))) finalName = `${stem}_${n++}${ext.toLowerCase()}`;
  // copy + unlink en vez de rename: funciona también entre discos distintos.
  fs.copyFileSync(tmpPath, path.join(dir, finalName));
  return { id: finalName, name: finalName, webViewLink: fileUrl(folderId, finalName) };
}

/** Lista los archivos de la carpeta de un depósito (para el modal "Archivos"). */
export function listFiles(folderId) {
  const dir = folderPath(folderId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => {
      const st = fs.statSync(path.join(dir, e.name));
      return { name: e.name, url: fileUrl(folderId, e.name), size: st.size, modified: st.mtime.toISOString() };
    })
    .sort((a, b) => a.modified.localeCompare(b.modified) || a.name.localeCompare(b.name));
}

/** Borra todos los archivos (para restaurar la demo). */
export function wipeFiles() {
  fs.rmSync(FILES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
}
