#!/usr/bin/env node

// Quick TypeScript Error Fix Script
const fs = require('fs');
const path = require('path');

const fixes = [
  // Fix error.message issues  
  { pattern: /} catch \(error\) {/g, replacement: '} catch (error: any) {' },
  { pattern: /} catch \(err\) {/g, replacement: '} catch (err: any) {' },
  { pattern: /error\.message/g, replacement: 'error instanceof Error ? error.message : String(error)' },
  { pattern: /err\.message/g, replacement: 'err instanceof Error ? err.message : String(err)' },
  { pattern: /error\.stack/g, replacement: 'error instanceof Error ? error.stack : String(error)' },
  { pattern: /err\.stack/g, replacement: 'err instanceof Error ? err.stack : String(err)' },
  // Fix globalThis issues
  { pattern: /globalThis\.GlobalWorkerOptions/g, replacement: '(globalThis as any).GlobalWorkerOptions' }
];

const functionFiles = [
  'supabase/functions/recalcular-precos-notas/index.ts',
  'supabase/functions/recategorizar-produtos-outros/index.ts', 
  'supabase/functions/send-confirmation-email/index.ts',
  'supabase/functions/setup-master-user/index.ts',
  'supabase/functions/test-insert-stock/index.ts',
  'supabase/functions/test-message-processing/index.ts',
  'supabase/functions/test-normalizacao-casos/index.ts',
  'supabase/functions/teste-ia2-manual/index.ts',
  'supabase/functions/teste-ia2/index.ts',
  'supabase/functions/update-precos-atuais/index.ts',
  'supabase/functions/validate-receipt/index.ts',
  'supabase/functions/verificar-codigo-whatsapp/index.ts',
  'supabase/functions/whatsapp-webhook/index.ts'
];

for (const filePath of functionFiles) {
  try {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Apply all fixes
      for (const fix of fixes) {
        content = content.replace(fix.pattern, fix.replacement);
      }
      
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed: ${filePath}`);
    }
  } catch (error) {
    console.log(`❌ Failed to fix: ${filePath} - ${error.message}`);
  }
}

console.log('🎉 TypeScript error fix complete!');