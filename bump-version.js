import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const versionFile = join(__dirname, 'version.json');
const packageFile = join(__dirname, 'package.json');
const constantsFile = join(__dirname, 'src/lib/constants.ts');

// Ler versão atual
const versionData = JSON.parse(readFileSync(versionFile, 'utf8'));
const packageData = JSON.parse(readFileSync(packageFile, 'utf8'));

// Incrementar versionCode
versionData.versionCode += 1;

// Auto-incrementar minor version
const [major, minor] = versionData.version.split('.').map(Number);
const newMinor = minor + 1;
versionData.version = `${major}.${newMinor}`;

// Atualizar package.json
packageData.version = `${versionData.version}.0`;

// Salvar arquivos
writeFileSync(versionFile, JSON.stringify(versionData, null, 2) + '\n');
writeFileSync(packageFile, JSON.stringify(packageData, null, 2) + '\n');
writeFileSync(
  constantsFile,
  `export const APP_VERSION = "${versionData.version}";\n`
);

console.log(`✅ Versão atualizada:`);
console.log(`   Versão: ${versionData.version}`);
console.log(`   Version Code: ${versionData.versionCode}`);
console.log(`\n📝 Arquivos atualizados:`);
console.log(`   - version.json`);
console.log(`   - package.json`);
console.log(`   - src/lib/constants.ts`);
