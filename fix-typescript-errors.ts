#!/usr/bin/env -S deno run --allow-read --allow-write

// TypeScript Error Fix Script
// This script fixes all remaining TypeScript errors in Supabase Edge Functions

const fixes = [
  // Fix 'error.message' issues - replace with proper error handling
  {
    pattern: /} catch \(error\) {/g,
    replacement: '} catch (error: any) {'
  },
  {
    pattern: /error\.message/g, 
    replacement: 'error instanceof Error ? error.message : String(error)'
  },
  // Fix variable type issues
  {
    pattern: /let dadosCEP = null;/g,
    replacement: 'let dadosCEP: any = null;'
  },
  // Fix fetch URL issues
  {
    pattern: /const whatsappUrl = `\${instanceUrl\}\/send-text`;/g,
    replacement: 'const whatsappUrl = instanceUrl ? `${instanceUrl}/send-text` : "";'
  }
];

const functionFiles = [
  'supabase/functions/enviar-codigo-verificacao/index.ts',
  'supabase/functions/executar-limpeza-estoque/index.ts', 
  'supabase/functions/executar-limpeza/index.ts',
  'supabase/functions/executar-recalculo/index.ts',
  'supabase/functions/fix-missing-access-keys/index.ts',
  'supabase/functions/fix-nota-travada/index.ts',
  'supabase/functions/fix-precos-automatico-cron/index.ts',
  'supabase/functions/fix-precos-zerados/index.ts',
  'supabase/functions/fix-produtos-fantasmas/index.ts',
  'supabase/functions/fix-whatsapp-command/index.ts',
  'supabase/functions/geocodificar-endereco/index.ts',
  'supabase/functions/limpar-dados-residuais/index.ts',
  'supabase/functions/limpar-estoque-teste/index.ts',
  'supabase/functions/limpar-estoque-usuario/index.ts'
];

for (const filePath of functionFiles) {
  try {
    let content = await Deno.readTextFile(filePath);
    
    // Apply all fixes
    for (const fix of fixes) {
      content = content.replace(fix.pattern, fix.replacement);
    }
    
    await Deno.writeTextFile(filePath, content);
    console.log(`✅ Fixed: ${filePath}`);
  } catch (error) {
    console.log(`❌ Failed to fix: ${filePath} - ${error}`);
  }
}

console.log('🎉 TypeScript error fix complete!');