# Script de Limpeza Profunda e Rebuild do Android
# Apenas caracteres ASCII - sem Unicode

Write-Host "Iniciando limpeza profunda do projeto Android..." -ForegroundColor Cyan
Write-Host ""

# Incrementar versão automaticamente
Write-Host "Incrementando versao..." -ForegroundColor Yellow
node bump-version.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao incrementar versao!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Configurar JAVA_HOME
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.8.9-hotspot"
Write-Host "JAVA_HOME configurado: $env:JAVA_HOME" -ForegroundColor Green

# FASE 1: Limpeza de Cache e Build
Write-Host ""
Write-Host "FASE 1: Limpando caches e builds antigos..." -ForegroundColor Yellow

if (Test-Path "android\app\build") {
    Remove-Item -Recurse -Force "android\app\build"
    Write-Host "  Removido android\app\build" -ForegroundColor Gray
}

if (Test-Path "android\build") {
    Remove-Item -Recurse -Force "android\build"
    Write-Host "  Removido android\build" -ForegroundColor Gray
}

if (Test-Path "android\.gradle") {
    Remove-Item -Recurse -Force "android\.gradle"
    Write-Host "  Removido android\.gradle" -ForegroundColor Gray
}

if (Test-Path "android\app\src\main\assets") {
    Remove-Item -Recurse -Force "android\app\src\main\assets"
    Write-Host "  Removido android\app\src\main\assets (WebView cache)" -ForegroundColor Gray
}

# Gradle clean
Write-Host ""
Write-Host "Executando gradlew clean..." -ForegroundColor Yellow
Set-Location android
.\gradlew clean
Set-Location ..
Write-Host "  Gradle clean concluido" -ForegroundColor Gray

# FASE 2: Rebuild Web
Write-Host ""
Write-Host "FASE 2: Rebuilding projeto web..." -ForegroundColor Yellow
npm run build
Write-Host "  Build web concluido" -ForegroundColor Gray

# FASE 3: Sync Capacitor
Write-Host ""
Write-Host "FASE 3: Sincronizando assets com Capacitor..." -ForegroundColor Yellow
npx cap sync android
Write-Host "  Capacitor sync concluido" -ForegroundColor Gray

# FASE 4: Limpar cache do Gradle
Write-Host ""
Write-Host "FASE 4: Limpando cache do Gradle..." -ForegroundColor Yellow
if (Test-Path "$env:USERPROFILE\.gradle\caches") {
    Remove-Item -Recurse -Force "$env:USERPROFILE\.gradle\caches\modules-2\files-2.1\*" -ErrorAction SilentlyContinue
    Write-Host "  Cache do Gradle limpo" -ForegroundColor Gray
}

# FASE 5: Build Android
Write-Host ""
Write-Host "FASE 5: Compilando APK Android..." -ForegroundColor Yellow
Set-Location android
.\gradlew assembleDebug --no-daemon
Set-Location ..
Write-Host "  APK compilado com sucesso" -ForegroundColor Gray

# FASE 6: Copiar APK
Write-Host ""
Write-Host "FASE 6: Copiando APK para Desktop..." -ForegroundColor Yellow
$versionData = Get-Content "version.json" | ConvertFrom-Json
$versionName = $versionData.versionName
$apkSource = "android\app\build\outputs\apk\debug\app-debug.apk"
$apkDest = "$env:USERPROFILE\Desktop\picotinho-v$versionName-COMPLETO.apk"

if (Test-Path $apkSource) {
    Copy-Item $apkSource $apkDest -Force
    Write-Host "  APK copiado: picotinho-v$versionName-COMPLETO.apk" -ForegroundColor Green
} else {
    Write-Host "  AVISO: APK nao encontrado em $apkSource" -ForegroundColor Yellow
}

# FASE 7: Instrucoes finais
Write-Host ""
Write-Host "BUILD COMPLETO!" -ForegroundColor Green
Write-Host "APK: $apkDest" -ForegroundColor Cyan
Write-Host ""
Write-Host "PROXIMOS PASSOS OBRIGATORIOS:" -ForegroundColor Cyan
Write-Host "1. DESINSTALE o Picotinho do celular" -ForegroundColor White
Write-Host "2. Va em Configuracoes > Apps > One UI Home > Armazenamento > Limpar cache" -ForegroundColor White
Write-Host "3. Va em Configuracoes > Apps > Android System WebView > Armazenamento > Limpar cache" -ForegroundColor White
Write-Host "4. Va em Configuracoes > Apps > Chrome > Armazenamento > Limpar cache" -ForegroundColor White
Write-Host "5. REINICIE O CELULAR" -ForegroundColor Yellow
Write-Host "6. Transfira o APK do Desktop para o celular" -ForegroundColor White
Write-Host "7. Instale o APK" -ForegroundColor White
Write-Host ""
Write-Host "Teste final:" -ForegroundColor Cyan
Write-Host "   - Icone: mascote Picotinho pequeno e centralizado" -ForegroundColor Gray
Write-Host "   - QR code do RJ: deve abrir HTML e confirmar sem erro" -ForegroundColor Gray
