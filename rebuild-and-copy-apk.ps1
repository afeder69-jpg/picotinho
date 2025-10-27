Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PICOTINHO - BUILD COMPLETO v1.3" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configurar JAVA_HOME
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
Write-Host "✓ JAVA_HOME configurado: $env:JAVA_HOME" -ForegroundColor Green

# Fase 1: Limpeza agressiva
Write-Host ""
Write-Host "=== FASE 1: LIMPEZA AGRESSIVA ===" -ForegroundColor Yellow
Write-Host "Removendo caches e builds antigos..." -ForegroundColor Gray

Remove-Item -Recurse -Force android\app\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force android\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force android\.gradle -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force android\app\src\main\assets -ErrorAction SilentlyContinue

Write-Host "✓ Caches removidos" -ForegroundColor Green

# Gradle clean
Write-Host ""
Write-Host "Executando Gradle clean..." -ForegroundColor Gray
Set-Location android
.\gradlew.bat clean --no-daemon
Set-Location ..
Write-Host "✓ Gradle clean concluído" -ForegroundColor Green

# Fase 2: Build web com plugin
Write-Host ""
Write-Host "=== FASE 2: BUILD WEB ===" -ForegroundColor Yellow
Write-Host "Compilando projeto web..." -ForegroundColor Gray

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Erro no build web!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Build web concluído" -ForegroundColor Green

# Verificar meta tags no dist/index.html
Write-Host ""
Write-Host "Verificando meta tags em dist/index.html..." -ForegroundColor Gray
$distHtml = Get-Content dist/index.html -Raw
if ($distHtml -match "Cache-Control") {
    Write-Host "✓ Meta tags de cache encontradas em dist/index.html" -ForegroundColor Green
} else {
    Write-Host "✗ AVISO: Meta tags de cache NÃO encontradas em dist/index.html" -ForegroundColor Red
}

# Fase 3: Capacitor sync
Write-Host ""
Write-Host "=== FASE 3: CAPACITOR SYNC ===" -ForegroundColor Yellow
Write-Host "Sincronizando assets com Android..." -ForegroundColor Gray

npx cap sync android

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Erro no Capacitor sync!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Capacitor sync concluído" -ForegroundColor Green

# Verificar meta tags no assets do Android
Write-Host ""
Write-Host "Verificando meta tags em android/app/src/main/assets/public/index.html..." -ForegroundColor Gray
$androidHtml = Get-Content android\app\src\main\assets\public\index.html -Raw
if ($androidHtml -match "Cache-Control") {
    Write-Host "✓ Meta tags de cache encontradas no assets do Android" -ForegroundColor Green
} else {
    Write-Host "✗ AVISO: Meta tags de cache NÃO encontradas no assets do Android" -ForegroundColor Red
}

# Fase 4: Build Android
Write-Host ""
Write-Host "=== FASE 4: BUILD ANDROID ===" -ForegroundColor Yellow
Write-Host "Compilando APK debug..." -ForegroundColor Gray

Set-Location android
.\gradlew.bat assembleDebug --rerun-tasks --no-daemon --no-build-cache

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Erro no build Android!" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..
Write-Host "✓ APK compilado com sucesso" -ForegroundColor Green

# Fase 5: Copiar APK para Desktop
Write-Host ""
Write-Host "=== FASE 5: COPIAR APK ===" -ForegroundColor Yellow

$desktopPath = "C:\Users\Alexandre\Desktop\Picotinho_APK"
$apkSource = "android\app\build\outputs\apk\debug\app-debug.apk"
$apkDestination = "$desktopPath\picotinho-v1.3-debug.apk"

# Criar pasta se não existir
New-Item -ItemType Directory -Force -Path $desktopPath | Out-Null

# Copiar APK
Copy-Item $apkSource $apkDestination -Force

Write-Host "✓ APK copiado para: $apkDestination" -ForegroundColor Green

# Informações do APK
$apkInfo = Get-Item $apkDestination
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "BUILD CONCLUÍDO COM SUCESSO!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "APK: $apkDestination" -ForegroundColor White
Write-Host "Tamanho: $([math]::Round($apkInfo.Length / 1MB, 2)) MB" -ForegroundColor White
Write-Host "Data: $($apkInfo.LastWriteTime)" -ForegroundColor White
Write-Host ""
Write-Host "PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host "1. Desinstale a versão antiga do Picotinho no celular" -ForegroundColor White
Write-Host "2. Limpe cache do WebView (Configurações > Apps > Android System WebView > Armazenamento > Limpar cache)" -ForegroundColor White
Write-Host "3. Limpe cache do Chrome (Configurações > Apps > Chrome > Armazenamento > Limpar cache)" -ForegroundColor White
Write-Host "4. Envie o APK via WhatsApp e instale" -ForegroundColor White
Write-Host "5. Abra o app e verifique no console: '🚀 Picotinho versionCode: 4, versionName: 1.3'" -ForegroundColor White
Write-Host ""
