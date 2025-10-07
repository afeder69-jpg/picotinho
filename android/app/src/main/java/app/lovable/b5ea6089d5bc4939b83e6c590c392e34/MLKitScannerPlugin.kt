package app.lovable.b5ea6089d5bc4939b83e6c590c392e34

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

@CapacitorPlugin(
    name = "MLKitScanner",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera")
    ]
)
class MLKitScannerPlugin : Plugin() {

    companion object {
        const val REQUEST_CAMERA_PERMISSION = 1001
        const val REQUEST_SCAN_CODE = 1002
    }

    private var savedCall: PluginCall? = null

    @PluginMethod
    fun scanBarcode(call: PluginCall) {
        Log.d("MLKitScanner", "🔍 [PLUGIN] scanBarcode() chamado")
        
        if (!hasRequiredPermissions()) {
            Log.w("MLKitScanner", "⚠️ [PLUGIN] Permissão de câmera não concedida, solicitando...")
            requestAllPermissions(call, "cameraPermissionCallback")
            return
        }

        Log.d("MLKitScanner", "✅ [PLUGIN] Permissão OK, iniciando scanner...")
        savedCall = call
        startScanner()
    }

    @PluginMethod
    fun cameraPermissionCallback(call: PluginCall) {
        Log.d("MLKitScanner", "🔑 [PLUGIN] cameraPermissionCallback chamado")
        if (hasRequiredPermissions()) {
            Log.d("MLKitScanner", "✅ [PLUGIN] Permissão concedida")
            savedCall = call
            startScanner()
        } else {
            Log.e("MLKitScanner", "❌ [PLUGIN] Permissão negada pelo usuário")
            call.reject("Permissão de câmera negada")
        }
    }

    private fun startScanner() {
        val currentCall = savedCall ?: run {
            Log.e("MLKitScanner", "❌ [PLUGIN] savedCall é null em startScanner()")
            return
        }
        
        try {
            Log.d("MLKitScanner", "🚀 [PLUGIN] Criando Intent para MLKitScannerActivity...")
            val intent = Intent(activity, MLKitScannerActivity::class.java)
            
            Log.d("MLKitScanner", "📱 [PLUGIN] Iniciando Activity com startActivityForResult...")
            
            // Usar ActivityResultLauncher moderno via Capacitor
            startActivityForResult(currentCall, intent, "scannerCallback")
            
            Log.d("MLKitScanner", "✅ [PLUGIN] startActivityForResult chamado com sucesso")
        } catch (e: Exception) {
            Log.e("MLKitScanner", "❌ [PLUGIN] ERRO ao iniciar MLKitScannerActivity: ${e.message}", e)
            currentCall.reject("Erro ao abrir scanner: ${e.message}")
            savedCall = null
        }
    }

    @PluginMethod
    fun scannerCallback(call: PluginCall) {
        Log.d("MLKitScanner", "📲 [PLUGIN] scannerCallback chamado")
        
        val currentCall = savedCall ?: run {
            Log.w("MLKitScanner", "⚠️ [PLUGIN] savedCall é null em scannerCallback")
            call.reject("Erro interno: savedCall é null")
            return
        }
        
        if (!call.data.has("activityResult")) {
            Log.e("MLKitScanner", "❌ [PLUGIN] activityResult não encontrado")
            currentCall.reject("Erro ao processar resultado")
            savedCall = null
            return
        }
        
        try {
            val result = call.getObject("activityResult")
            val resultCode = result.getInt("resultCode")
            
            Log.d("MLKitScanner", "📲 [PLUGIN] resultCode: $resultCode")
            
            if (resultCode == android.app.Activity.RESULT_OK) {
                val data = result.getJSONObject("data")
                val scanResult = data?.getString("SCAN_RESULT")
                
                Log.d("MLKitScanner", "✅ [PLUGIN] Scan OK - Resultado: $scanResult")
                
                if (scanResult != null) {
                    val jsResult = JSObject()
                    jsResult.put("ScanResult", scanResult)
                    currentCall.resolve(jsResult)
                    Log.d("MLKitScanner", "✅ [PLUGIN] Resultado enviado para JS")
                } else {
                    Log.w("MLKitScanner", "⚠️ [PLUGIN] Resultado vazio")
                    currentCall.reject("Nenhum código detectado")
                }
            } else {
                Log.d("MLKitScanner", "ℹ️ [PLUGIN] Scanner cancelado pelo usuário")
                currentCall.reject("Scanner cancelado")
            }
        } catch (e: Exception) {
            Log.e("MLKitScanner", "❌ [PLUGIN] Erro ao processar resultado: ${e.message}", e)
            currentCall.reject("Erro ao processar resultado: ${e.message}")
        }
        
        savedCall = null
    }

    override fun hasRequiredPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }
}
