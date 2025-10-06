package app.lovable.b5ea6089d5bc4939b83e6c590c392e34

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
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
        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "cameraPermissionCallback")
            return
        }

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
        val intent = Intent(activity, MLKitScannerActivity::class.java)
        startActivityForResult(call, intent, REQUEST_SCAN_CODE)
    }

    override fun handleOnActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.handleOnActivityResult(requestCode, resultCode, data)

        if (requestCode == REQUEST_SCAN_CODE) {
            val call = savedCall ?: return
            
            if (resultCode == android.app.Activity.RESULT_OK) {
                val scanResult = data?.getStringExtra("SCAN_RESULT")
                if (scanResult != null) {
                    val result = JSObject()
                    result.put("ScanResult", scanResult)
                    call.resolve(result)
                } else {
                    call.reject("Nenhum código detectado")
                }
            } else {
                call.reject("Scanner cancelado")
            }
            
            savedCall = null
        }
    }

    private fun hasRequiredPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }
}
