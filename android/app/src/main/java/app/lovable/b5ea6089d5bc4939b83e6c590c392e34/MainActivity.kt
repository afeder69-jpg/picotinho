package app.lovable.b5ea6089d5bc4939b83e6c590c392e34

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Registrar o plugin customizado do ML Kit
        registerPlugin(MLKitScannerPlugin::class.java)
    }
}
