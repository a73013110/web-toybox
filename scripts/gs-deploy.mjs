/*
 * 更新現有的 Apps Script 部署，網址不變。
 *
 * 部署 ID 就是 /exec 網址中間那一段，直接從 shared/config.js 讀出來，
 * 免得每次都要跑 clasp deployments 去查。
 *
 * 用法：
 *   npm run gs:deploy
 *   npm run gs:deploy -- "改了什麼"
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = readFileSync(join(root, 'shared', 'config.js'), 'utf8');
const match = config.match(/macros\/s\/([\w-]+)\/exec/);

if (!match) {
  console.error('在 shared/config.js 找不到 Apps Script 部署網址。');
  console.error('請確認 APPS_SCRIPT_ENDPOINT 的格式是 .../macros/s/<部署ID>/exec');
  process.exit(1);
}

const deploymentId = match[1];
const args = process.argv.slice(2).filter((arg) => arg !== '--dry-run');
const description = args.join(' ').trim() || 'update';
const command = `npx clasp redeploy ${deploymentId} -d ${JSON.stringify(description)}`;

console.log(`部署 ID：${deploymentId.slice(0, 12)}…（取自 shared/config.js）`);
console.log(`執行：${command}\n`);

if (process.argv.includes('--dry-run')) process.exit(0);

try {
  execSync(command, { cwd: join(root, 'apps-script'), stdio: 'inherit' });
} catch {
  process.exit(1); // clasp 已經印過錯誤訊息，不重複輸出。
}
