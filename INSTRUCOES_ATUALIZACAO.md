# 📱 Instruções para Atualizar o App Picotinho no Android

## ⚠️ Problema Atual
O app Android não está refletindo as alterações mais recentes:
- Ícone antigo (robô verde padrão) ao invés do mascote Picotinho
- Dialog "🔍 Abrir nota e processar?" não aparece após escanear QR code
- Nota não é processada automaticamente ao voltar do browser

## 🎯 Objetivo
Forçar uma instalação completamente limpa do app com:
- ✅ Ícone do mascote Picotinho
- ✅ Dialog aparecendo imediatamente após escanear QR code
- ✅ Processamento automático da nota ao voltar do browser

## 🔧 Solução: Limpeza Profunda + Rebuild

### Passo 1: Execute o Script de Limpeza
No PowerShell, na pasta raiz do projeto:

```powershell
.\rebuild-android.ps1
```

Este script vai:
1. ✅ Limpar todos os caches do Gradle
2. ✅ Deletar builds antigos
3. ✅ Deletar cache do WebView (assets)
4. ✅ Rebuild do projeto web
5. ✅ Sync completo do Capacitor
6. ✅ Compilar novo APK do zero

### Passo 2: Desinstalar App do Celular
**IMPORTANTE:** Desinstale manualmente o Picotinho do celular antes de continuar.

### Passo 3: Instalar Nova Versão
```powershell
npx cap run android
```

### Passo 4: Testar
Após instalação, verifique:
1. ✅ **Ícone:** O ícone do app deve ser o mascote Picotinho (não mais o robô verde)
2. ✅ **QR Code:** Ao escanear um QR code de nota fiscal, deve aparecer **IMEDIATAMENTE** o dialog:
   ```
   🔍 Abrir nota e processar?
   
   Você será redirecionado para o site da Receita Federal
   para abrir a nota. Ao voltar, ela será processada
   automaticamente.
   
   [Não] [Sim]
   ```
3. ✅ **Processamento:** Ao clicar "Sim", o browser abre a nota. Ao voltar para o app, a nota é processada automaticamente.

## 🆘 Se Ainda Não Funcionar

Se após os passos acima o problema persistir, execute uma limpeza mais profunda via ADB:

```powershell
# Desinstalar completamente (remove app + dados)
adb uninstall app.lovable.b5ea6089d5bc4939b83e6c590c392e34

# Limpar dados residuais
adb shell pm clear app.lovable.b5ea6089d5bc4939b83e6c590c392e34

# Reinstalar
npx cap run android
```

## 🔍 Verificações Técnicas

### Ícones Atualizados
Os seguintes arquivos foram substituídos com a imagem do mascote:
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`
- E respectivos `ic_launcher_round.png`

### Código do Dialog
O dialog está implementado em `src/components/BottomNavigation.tsx`:
- Detecta quando um QR code de nota fiscal é escaneado
- Mostra o AlertDialog **ANTES** de abrir o browser
- Salva a URL no localStorage com timestamp
- Ao voltar do browser, processa automaticamente via `processNotaUrl()`

## 📝 Notas Importantes

1. **Cache do Android Studio:** O Android Studio pode manter caches agressivos. Se necessário, faça "File > Invalidate Caches and Restart" no Android Studio.

2. **WebView Cache:** O Capacitor usa um WebView que mantém cache próprio. Por isso deletamos a pasta `assets` antes do sync.

3. **Gradle Cache:** O Gradle mantém caches em `~/.gradle/caches/`. Se o problema persistir, pode ser necessário limpar essa pasta também.

4. **Instalação Limpa:** É crucial desinstalar o app antigo antes de instalar a nova versão. Apenas reinstalar por cima pode não limpar todos os caches.

## ✅ Sucesso!
Se os 3 pontos de teste funcionarem, o problema está resolvido e o app está completamente atualizado.
