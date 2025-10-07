package app.lovable.b5ea6089d5bc4939b83e6c590c392e34

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.app.ActivityCompat
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
        Log.d("MLKitScanner", "🔍 scanBarcode() chamado")
        
        if (!hasRequiredPermissions()) {
            Log.w("MLKitScanner", "⚠️ Permissão de câmera não concedida, solicitando...")
            requestAllPermissions(call, "cameraPermissionCallback")
            return
        }

        Log.d("MLKitScanner", "✅ Permissão OK, iniciando scanner...")
        savedCall = call
        startScanner()
    }

    @PluginMethod
    fun cameraPermissionCallback(call: PluginCall) {
        if (hasRequiredPermissions()) {
            savedCall = call
            startScanner()
        } else {
            call.reject("Permissão de câmera negada")
        }
    }

    private fun startScanner() {
        val currentCall = savedCall ?: run {
            Log.e("MLKitScanner", "❌ savedCall é null em startScanner()")
            return
        }
        
        try {
            Log.d("MLKitScanner", "🚀 Criando Intent para MLKitScannerActivity...")
            val intent = Intent(activity, MLKitScannerActivity::class.java)
            
            Log.d("MLKitScanner", "📱 Iniciando Activity com startActivityForResult...")
            startActivityForResult(currentCall, intent, REQUEST_SCAN_CODE)
            
            Log.d("MLKitScanner", "✅ Activity iniciada com sucesso")
        } catch (e: Exception) {
            Log.e("MLKitScanner", "❌ ERRO ao iniciar MLKitScannerActivity: ${e.message}", e)
            currentCall.reject("Erro ao abrir scanner: ${e.message}")
            savedCall = null
        }
    }

    override fun handleOnActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.handleOnActivityResult(requestCode, resultCode, data)

        Log.d("MLKitScanner", "📲 handleOnActivityResult - requestCode: $requestCode, resultCode: $resultCode")

        if (requestCode == REQUEST_SCAN_CODE) {
            val currentCall = savedCall ?: run {
                Log.w("MLKitScanner", "⚠️ savedCall é null em handleOnActivityResult")
                return
            }
            
            if (resultCode == android.app.Activity.RESULT_OK) {
                val scanResult = data?.getStringExtra("SCAN_RESULT")
                Log.d("MLKitScanner", "✅ Scan OK - Resultado: $scanResult")
                
                if (scanResult != null) {
                    val result = JSObject()
                    result.put("ScanResult", scanResult)
                    currentCall.resolve(result)
                } else {
                    Log.w("MLKitScanner", "⚠️ Resultado vazio")
                    currentCall.reject("Nenhum código detectado")
                }
            } else {
                Log.d("MLKitScanner", "ℹ️ Scanner cancelado pelo usuário")
                currentCall.reject("Scanner cancelado")
            }
            
            savedCall = null
        }
    }

    override fun hasRequiredPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }
}
