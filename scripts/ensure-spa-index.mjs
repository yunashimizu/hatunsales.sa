/**
 * Angular con SSR deja index.csr.html en browser/.
 * Vercel (SPA estática) necesita index.html para / y para rewrites de /store, /auth, etc.
 * No toca el servidor SSR; solo duplica el shell CSR si hace falta.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const browserDir = join(process.cwd(), 'dist', 'ferreteria', 'browser');
const csr = join(browserDir, 'index.csr.html');
const index = join(browserDir, 'index.html');

if (existsSync(csr) && !existsSync(index)) {
  copyFileSync(csr, index);
  console.log('SPA: copiado index.csr.html → index.html');
} else if (existsSync(index)) {
  console.log('SPA: index.html ya existe');
} else {
  console.warn('SPA: no se encontró index.csr.html ni index.html en', browserDir);
}
