# ====================================================================
# SCRIPT DE BUILD VERIFICADO - DIAGNÓSTICO COMPLETO
# ====================================================================
# Este script garante que todas as mudanças sejam aplicadas no APK
# ====================================================================

Write-Host ""
Write-Host "🔧 INICIANDO BUILD VERIFICADO - DIAGNÓSTICO COMPLETO" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Gray
Write-Host ""

# PASSO 1: Incrementar versão
Write-Host "📝 PASSO 1: Incrementando versão..." -ForegroundColor Yellow
node bump-version.js

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERRO: Falha ao incrementar versão!" -ForegroundColor Red
    exit 1
}

# PASSO 2: Ler e mostrar versão atual
$versionJson = Get-Content version.json | ConvertFrom-Json
$version = $versionJson.version
$versionCode = $versionJson.versionCode

Write-Host "✅ VERSÃO INCREMENTADA:" -ForegroundColor Green
Write-Host "   Versão: $version" -ForegroundColor White
Write-Host "   Version Code: $versionCode" -ForegroundColor White
Write-Host ""

# PASSO 3: Limpar TUDO (cache agressivo)
Write-Host "🧹 PASSO 3: Limpando todos os caches..." -ForegroundColor Yellow

$pathsToClean = @(
    "android\app\build",
    "android\build",
    "android\.gradle",
    "dist",
    "node_modules\.vite",
    "android\app\src\main\assets"
)

foreach ($path in $pathsToClean) {
    if (Test-Path $path) {
        Write-Host "   Removendo: $path" -ForegroundColor Gray
        Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
    }
}

Write-Host "✅ Caches limpos" -ForegroundColor Green
Write-Host ""

# PASSO 4: Build Web
Write-Host "🔨 PASSO 4: Building web assets..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERRO: Build web falhou!" -ForegroundColor Red
    exit 1
}

# PASSO 5: Verificar dist/index.html
Write-Host "🔍 PASSO 5: Verificando dist/index.html..." -ForegroundColor Yellow

if (!(Test-Path "dist\index.html")) {
    Write-Host "❌ ERRO: dist\index.html não foi criado!" -ForegroundColor Red
    exit 1
}

$distContent = Get-Content "dist\index.html" -Raw
if ($distContent -match "InAppBrowser" -or $distContent -match "v$version") {
    Write-Host "✅ dist/index.html contém código atualizado" -ForegroundColor Green
} else {
    Write-Host "⚠️  AVISO: Não foi possível confirmar versão no dist/index.html" -ForegroundColor Yellow
}
Write-Host ""

# PASSO 6: Sync Capacitor
Write-Host "🔄 PASSO 6: Sincronizando Capacitor..." -ForegroundColor Yellow
npx cap sync android

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERRO: Capacitor sync falhou!" -ForegroundColor Red
    exit 1
}

# PASSO 7: Verificar assets Android
Write-Host "🔍 PASSO 7: Verificando assets Android..." -ForegroundColor Yellow

$androidAssetPath = "android\app\src\main\assets\public\index.html"
if (!(Test-Path $androidAssetPath)) {
    Write-Host "❌ ERRO: Assets não foram copiados para Android!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Assets copiados para Android" -ForegroundColor Green
Write-Host ""

# PASSO 8: Configurar JAVA_HOME
Write-Host "☕ PASSO 8: Configurando JAVA_HOME..." -ForegroundColor Yellow
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
Write-Host "   JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Gray
Write-Host ""

# PASSO 9: Gradle Clean
Write-Host "🧹 PASSO 9: Executando gradle clean..." -ForegroundColor Yellow
Push-Location android
.\gradlew clean
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERRO: Gradle clean falhou!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Gradle clean completo" -ForegroundColor Green
Write-Host ""

# PASSO 10: Build APK
Write-Host "📱 PASSO 10: Building APK debug..." -ForegroundColor Yellow
Push-Location android
.\gradlew assembleDebug
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERRO: Build do APK falhou!" -ForegroundColor Red
    exit 1
}

# PASSO 11: Verificar APK gerado
$apkPath = "android\app\build\outputs\apk\debug\app-debug.apk"
if (!(Test-Path $apkPath)) {
    Write-Host "❌ ERRO: APK não foi gerado!" -ForegroundColor Red
    exit 1
}

$apkSize = (Get-Item $apkPath).Length / 1MB
Write-Host "✅ APK gerado com sucesso!" -ForegroundColor Green
Write-Host "   Tamanho: $([math]::Round($apkSize, 2)) MB" -ForegroundColor White
Write-Host ""

# PASSO 12: Copiar APK para Desktop
Write-Host "📋 PASSO 12: Copiando APK para Desktop..." -ForegroundColor Yellow

$desktopPath = [Environment]::GetFolderPath("Desktop")
$targetFolder = Join-Path $desktopPath "Picotinho APK"

if (!(Test-Path $targetFolder)) {
    New-Item -ItemType Directory -Path $targetFolder | Out-Null
}

$targetApk = Join-Path $targetFolder "picotinho-v$version.apk"
Copy-Item $apkPath $targetApk -Force

Write-Host "✅ APK copiado para:" -ForegroundColor Green
Write-Host "   $targetApk" -ForegroundColor White
Write-Host ""

# ====================================================================
# RESUMO E PRÓXIMOS PASSOS
# ====================================================================

Write-Host ""
Write-Host "🎉 BUILD COMPLETO E VERIFICADO!" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Gray
Write-Host ""
Write-Host "📦 VERSÃO GERADA: $version (code: $versionCode)" -ForegroundColor Cyan
Write-Host "📁 LOCAL DO APK: $targetApk" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 PRÓXIMOS PASSOS OBRIGATÓRIOS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  DESINSTALAR completamente o app do celular" -ForegroundColor White
Write-Host "   Via ADB:" -ForegroundColor Gray
Write-Host "   adb uninstall app.lovable.b5ea6089d5bc4939b83e6c590c392e34" -ForegroundColor Cyan
Write-Host ""
Write-Host "2️⃣  LIMPAR dados residuais:" -ForegroundColor White
Write-Host "   adb shell pm clear app.lovable.b5ea6089d5bc4939b83e6c590c392e34" -ForegroundColor Cyan
Write-Host ""
Write-Host "3️⃣  INSTALAR o novo APK:" -ForegroundColor White
Write-Host "   npx cap run android" -ForegroundColor Cyan
Write-Host "   OU copiar o APK manualmente do Desktop" -ForegroundColor Gray
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Gray
Write-Host ""
Write-Host "🔍 CHECKLIST DE VERIFICAÇÃO NO CELULAR:" -ForegroundColor Yellow
Write-Host ""
Write-Host "✅ NO TOPO DA TELA deve aparecer banner amarelo:" -ForegroundColor White
Write-Host "   📱 v$version | 🚨 InAppBrowser ATIVO | ⏰ Build: [timestamp]" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ NO CONSOLE (chrome://inspect) deve aparecer:" -ForegroundColor White
Write-Host "   AUTHPROVIDER: INAPPBROWSER VERSÃO ATIVA" -ForegroundColor Gray
Write-Host "   AUTH.TSX: USANDO INAPPBROWSER" -ForegroundColor Gray
Write-Host "   Biblioteca: @capgo/inappbrowser v7.29.0" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ AO CLICAR Entrar com Google:" -ForegroundColor White
Write-Host "   Deve abrir janela DIFERENTE do Chrome Custom Tab" -ForegroundColor Gray
Write-Host "   Deve ter título Picotinho ou genérico (sem barra do Chrome)" -ForegroundColor Gray
Write-Host "   Deve interceptar deep link picotinho://auth/callback" -ForegroundColor Gray
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Gray
Write-Host ""
Write-Host "🚨 SE O BANNER AMARELO NÃO APARECER:" -ForegroundColor Red
Write-Host "   O código não está sendo atualizado no APK" -ForegroundColor White
Write-Host "   Verifique se o APK foi realmente reinstalado" -ForegroundColor White
Write-Host "   Confirme a versão em chrome://inspect" -ForegroundColor White
Write-Host ""
Write-Host "🚨 SE OS LOGS NÃO APARECEREM NO CONSOLE:" -ForegroundColor Red
Write-Host "   O código TypeScript não foi compilado corretamente" -ForegroundColor White
Write-Host "   Execute: npm list @capgo/inappbrowser" -ForegroundColor White
Write-Host "   Deve mostrar: @capgo/inappbrowser@7.29.0" -ForegroundColor White
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Gray
Write-Host ""
