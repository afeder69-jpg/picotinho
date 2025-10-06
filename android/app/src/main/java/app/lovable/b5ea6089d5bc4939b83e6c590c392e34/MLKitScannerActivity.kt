package app.lovable.b5ea6089d5bc4939b83e6c590c392e34

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MLKitScannerActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var overlayView: BarcodeOverlayView
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var barcodeScanner: BarcodeScanner
    private var isScanning = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Criar layout programaticamente com FrameLayout para sobrepor overlay
        val frameLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        
        // PreviewView da câmera
        previewView = PreviewView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        
        // OverlayView para desenhar os 4 pontos amarelos
        overlayView = BarcodeOverlayView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        
        // Adicionar preview primeiro, overlay por cima
        frameLayout.addView(previewView)
        frameLayout.addView(overlayView)
        setContentView(frameLayout)
        
        // Configurar ML Kit para apenas QR_CODE
        val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
        
        barcodeScanner = BarcodeScanning.getClient(options)
        cameraExecutor = Executors.newSingleThreadExecutor()
        
        startCamera()
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            // Preview
            val preview = Preview.Builder()
                .build()
                .also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

            // Image Analysis para ML Kit
            val imageAnalyzer = ImageAnalysis.Builder()
                .setTargetResolution(android.util.Size(1280, 720))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also {
                    it.setAnalyzer(cameraExecutor) { imageProxy ->
                        processImageProxy(imageProxy)
                    }
                }

            // Selecionar câmera traseira
            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider.unbindAll()
                
                // Bind com autofocus
                val camera = cameraProvider.bindToLifecycle(
                    this,
                    cameraSelector,
                    preview,
                    imageAnalyzer
                )
                
                // Habilitar autofocus contínuo
                val cameraControl = camera.cameraControl
                cameraControl.enableTorch(false) // flash desligado por padrão

            } catch (e: Exception) {
                Log.e("MLKitScanner", "Erro ao iniciar câmera", e)
                Toast.makeText(this, "Erro ao iniciar câmera", Toast.LENGTH_SHORT).show()
                finish()
            }

        }, ContextCompat.getMainExecutor(this))
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun processImageProxy(imageProxy: ImageProxy) {
        if (!isScanning) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            val image = InputImage.fromMediaImage(
                mediaImage,
                imageProxy.imageInfo.rotationDegrees
            )

            barcodeScanner.process(image)
                .addOnSuccessListener { barcodes ->
                    // Limpar overlay se não há barcodes
                    if (barcodes.isEmpty()) {
                        runOnUiThread {
                            overlayView.clear()
                        }
                    }
                    
                    for (barcode in barcodes) {
                        // ✅ DESENHAR OS 4 PONTOS AMARELOS (cornerPoints)
                        runOnUiThread {
                            overlayView.updateBarcodeCorners(barcode)
                        }
                        
                        val rawValue = barcode.rawValue
                        if (rawValue != null) {
                            Log.d("MLKitScanner", "✅ QR Code detectado: $rawValue")
                            Log.d("MLKitScanner", "📍 cornerPoints: ${barcode.cornerPoints?.contentToString()}")
                            
                            // Parar scanning e retornar resultado
                            isScanning = false
                            
                            runOnUiThread {
                                Toast.makeText(
                                    this,
                                    "✅ QR Code detectado!",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                            
                            val resultIntent = Intent().apply {
                                putExtra("SCAN_RESULT", rawValue)
                            }
                            setResult(Activity.RESULT_OK, resultIntent)
                            finish()
                            return@addOnSuccessListener
                        }
                    }
                }
                .addOnFailureListener { e ->
                    Log.e("MLKitScanner", "Erro ao processar imagem", e)
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        barcodeScanner.close()
    }

    override fun onBackPressed() {
        setResult(Activity.RESULT_CANCELED)
        super.onBackPressed()
    }
}
