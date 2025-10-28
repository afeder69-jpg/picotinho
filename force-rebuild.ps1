# Script de Rebuild FORÇADO - Limpa TUDO e reconstrói do zero
Write-Host "🔥 REBUILD FORÇADO - Limpeza Agressiva" -ForegroundColor Red
Write-Host ""

# ⬆️ FASE 0: INCREMENTAR VERSÃO AUTOMATICAMENTE
Write-Host "⬆️  FASE 0: Incrementando versão..." -ForegroundColor Cyan
node bump-version.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Erro ao incrementar versão!" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Versão incrementada" -ForegroundColor Green
Write-Host ""

# FASE 1: Deletar TUDO manualmente
Write-Host "🗑️  FASE 1: Deletando caches..." -ForegroundColor Yellow

$foldersToDelete = @(
    "dist",
    "node_modules\.vite",
    "android\app\build",
    "android\app\src\main\assets",
    "android\build",
    "android\.gradle",
    ".gradle"
)

foreach ($folder in $foldersToDelete) {
    if (Test-Path $folder) {
        Write-Host "  ❌ Deletando: $folder" -ForegroundColor Gray
        Remove-Item -Recurse -Force $folder -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
}

# FASE 2: Limpar caches do sistema
Write-Host ""
Write-Host "🧹 FASE 2: Limpando caches do sistema..." -ForegroundColor Yellow
npm cache clean --force
Write-Host "  ✓ Cache do npm limpo" -ForegroundColor Gray

# FASE 3: Clean do Gradle
Write-Host ""
Write-Host "🔧 FASE 3: Limpando Gradle..." -ForegroundColor Yellow
Set-Location android
if (Test-Path ".\gradlew.bat") {
    .\gradlew.bat clean --no-daemon --no-build-cache
} else {
    .\gradlew clean --no-daemon --no-build-cache
}
Set-Location ..
Write-Host "  ✓ Gradle limpo" -ForegroundColor Gray

# FASE 4: Build do zero com verificação
Write-Host ""
Write-Host "🔨 FASE 4: Construindo projeto web..." -ForegroundColor Yellow
npm run build

# Verificar se o build gerou arquivos com timestamp
Write-Host ""
Write-Host "🔍 VERIFICANDO BUILD..." -ForegroundColor Cyan
$jsFiles = Get-ChildItem -Path "dist\assets\*.js" | Where-Object { $_.Name -match "index.*\.js$" }
if ($jsFiles) {
    foreach ($file in $jsFiles) {
        Write-Host "  ✓ Arquivo gerado: $($file.Name)" -ForegroundColor Green
        if ($file.Name -notmatch "\d{13}") {
            Write-Host "  ⚠️  AVISO: Arquivo não tem timestamp de 13 dígitos!" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  ❌ ERRO: Nenhum arquivo index.*.js encontrado!" -ForegroundColor Red
    exit 1
}

# FASE 5: Sync com Android
Write-Host ""
Write-Host "📱 FASE 5: Sincronizando com Android..." -ForegroundColor Yellow
npx cap sync android
Write-Host "  ✓ Sync concluído" -ForegroundColor Gray

# FASE 6: Desinstalar app antigo
Write-Host ""
Write-Host "🗑️  FASE 6: Removendo app antigo..." -ForegroundColor Yellow
adb uninstall app.lovable.b5ea6089d5bc4939b83e6c590c392e34
adb shell pm clear com.android.webview
Write-Host "  ✓ App antigo removido" -ForegroundColor Gray

# FASE 7: Build APK do zero
Write-Host ""
Write-Host "📦 FASE 7: Compilando APK..." -ForegroundColor Yellow
Set-Location android
if (Test-Path ".\gradlew.bat") {
    .\gradlew.bat assembleDebug --no-daemon --no-build-cache --rerun-tasks
} else {
    .\gradlew assembleDebug --no-daemon --no-build-cache --rerun-tasks
}
Set-Location ..
Write-Host "  ✓ APK compilado" -ForegroundColor Gray

# FASE 8: Instalar e executar
Write-Host ""
Write-Host "🚀 FASE 8: Instalando no dispositivo..." -ForegroundColor Yellow
npx cap run android

Write-Host ""
Write-Host "✅ REBUILD COMPLETO!" -ForegroundColor Green
Write-Host ""
Write-Host "🔍 VERIFIQUE NOS LOGS:" -ForegroundColor Cyan
Write-Host "  1. O nome do arquivo JavaScript deve ter timestamp de 13 dígitos" -ForegroundColor White
Write-Host "     Exemplo: index.XXXX-1761429500000.js" -ForegroundColor Gray
Write-Host "  2. Deve aparecer 'InAppBrowser' nos logs" -ForegroundColor White
Write-Host "  3. Deve chamar 'process-html-capturado' e não 'process-url-nota'" -ForegroundColor White
Write-Host ""
