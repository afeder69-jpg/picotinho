# Script de Limpeza Profunda e Rebuild do Android
Write-Host "🚀 Iniciando limpeza profunda do projeto Android..." -ForegroundColor Cyan
Write-Host ""

# Configurar JAVA_HOME
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.8.9-hotspot"
Write-Host "✅ JAVA_HOME configurado: $env:JAVA_HOME" -ForegroundColor Green

# FASE 1: Limpeza de Cache e Build
Write-Host ""
Write-Host "🧹 FASE 1: Limpando caches e builds antigos..." -ForegroundColor Yellow

if (Test-Path "android\app\build") {
    Remove-Item -Recurse -Force "android\app\build"
    Write-Host "  ✓ Removido android\app\build" -ForegroundColor Gray
}

if (Test-Path "android\build") {
    Remove-Item -Recurse -Force "android\build"
    Write-Host "  ✓ Removido android\build" -ForegroundColor Gray
}

if (Test-Path "android\.gradle") {
    Remove-Item -Recurse -Force "android\.gradle"
    Write-Host "  ✓ Removido android\.gradle" -ForegroundColor Gray
}

if (Test-Path "android\app\src\main\assets") {
    Remove-Item -Recurse -Force "android\app\src\main\assets"
    Write-Host "  ✓ Removido android\app\src\main\assets (WebView cache)" -ForegroundColor Gray
}

# Gradle clean
Write-Host ""
Write-Host "🔧 Executando gradlew clean..." -ForegroundColor Yellow
Set-Location android
.\gradlew clean
Set-Location ..
Write-Host "  ✓ Gradle clean concluído" -ForegroundColor Gray

# FASE 2: Rebuild Web
Write-Host ""
Write-Host "🔨 FASE 2: Rebuilding projeto web..." -ForegroundColor Yellow
npm run build
Write-Host "  ✓ Build web concluído" -ForegroundColor Gray

# FASE 3: Sync Capacitor
Write-Host ""
Write-Host "🔄 FASE 3: Sincronizando assets com Capacitor..." -ForegroundColor Yellow
npx cap sync android
Write-Host "  ✓ Capacitor sync concluído" -ForegroundColor Gray

# FASE 4: Build Android
Write-Host ""
Write-Host "📱 FASE 4: Compilando APK Android..." -ForegroundColor Yellow
Set-Location android
.\gradlew assembleDebug
Set-Location ..
Write-Host "  ✓ APK compilado com sucesso" -ForegroundColor Gray

# FASE 5: Instruções finais
Write-Host ""
Write-Host "✅ BUILD COMPLETO!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 PRÓXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host "1. DESINSTALE o Picotinho do celular manualmente" -ForegroundColor White
Write-Host "2. Execute: npx cap run android" -ForegroundColor White
Write-Host "3. Teste:" -ForegroundColor White
Write-Host "   - Ícone deve ser o mascote Picotinho" -ForegroundColor Gray
Write-Host "   - QR code deve mostrar dialog antes de abrir browser" -ForegroundColor Gray
Write-Host "   - Ao voltar do browser, deve processar automaticamente" -ForegroundColor Gray
