package app.lovable.b5ea6089d5bc4939b83e6c590c392e34

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

@CapacitorPlugin(
    name = "MLKitScanner",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera")
    ]
)
class MLKitScannerPlugin : Plugin() {

    @PluginMethod
    fun scanBarcode(call: PluginCall) {
        Log.d("MLKitScanner", "🔍 [PLUGIN] scanBarcode() chamado")
        
        if (!hasRequiredPermissions()) {
            Log.w("MLKitScanner", "⚠️ [PLUGIN] Permissão de câmera não concedida, solicitando...")
            requestAllPermissions(call, "handlePermissionResult")
            return
        }

        Log.d("MLKitScanner", "✅ [PLUGIN] Permissão OK, iniciando scanner...")
        startScanner(call)
    }

    @PluginMethod
    fun handlePermissionResult(call: PluginCall) {
        Log.d("MLKitScanner", "🔑 [PLUGIN] handlePermissionResult chamado")
        if (hasRequiredPermissions()) {
            Log.d("MLKitScanner", "✅ [PLUGIN] Permissão concedida")
            startScanner(call)
        } else {
            Log.e("MLKitScanner", "❌ [PLUGIN] Permissão negada pelo usuário")
            call.reject("Permissão de câmera negada")
        }
    }

    private fun startScanner(call: PluginCall) {
        try {
            Log.d("MLKitScanner", "🚀 [PLUGIN] Criando Intent para MLKitScannerActivity...")
            val intent = Intent(activity, MLKitScannerActivity::class.java)
            
            Log.d("MLKitScanner", "📱 [PLUGIN] Iniciando Activity com startActivityForResult...")
            
            // Usar API moderna do Capacitor 6
            startActivityForResult(call, intent, "handleScanResult")
            
            Log.d("MLKitScanner", "✅ [PLUGIN] startActivityForResult chamado com sucesso")
        } catch (e: Exception) {
            Log.e("MLKitScanner", "❌ [PLUGIN] ERRO ao iniciar MLKitScannerActivity: ${e.message}", e)
            call.reject("Erro ao abrir scanner: ${e.message}")
        }
    }

    @ActivityCallback
    private fun handleScanResult(call: PluginCall, result: ActivityResult) {
        Log.d("MLKitScanner", "📲 [PLUGIN] handleScanResult chamado")
        Log.d("MLKitScanner", "📲 [PLUGIN] resultCode: ${result.resultCode}")
        
        if (result.resultCode == Activity.RESULT_OK) {
            val scanResult = result.data?.getStringExtra("SCAN_RESULT")
            Log.d("MLKitScanner", "✅ [PLUGIN] Scan OK - Resultado: $scanResult")
            
            if (scanResult != null) {
                val jsResult = JSObject()
                jsResult.put("ScanResult", scanResult)
                call.resolve(jsResult)
                Log.d("MLKitScanner", "✅ [PLUGIN] Resultado enviado para JS")
            } else {
                Log.w("MLKitScanner", "⚠️ [PLUGIN] Resultado vazio")
                call.reject("Nenhum código detectado")
            }
        } else {
            Log.d("MLKitScanner", "ℹ️ [PLUGIN] Scanner cancelado pelo usuário")
            call.reject("Scanner cancelado")
        }
    }

    override fun hasRequiredPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }
}
