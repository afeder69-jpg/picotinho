package app.lovable.b5ea6089d5bc4939b83e6c590c392e34;

import com.getcapacitor.BridgeActivity;
import app.lovable.b5ea6089d5bc4939b83e6c590c392e34.MLKitScannerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Registrar o plugin customizado do ML Kit
        registerPlugin(MLKitScannerPlugin.class);
    }
}
