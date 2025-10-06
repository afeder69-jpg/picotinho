package app.lovable.b5ea6089d5bc4939b83e6c590c392e34

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PointF
import android.util.AttributeSet
import android.util.Log
import android.view.View
import com.google.mlkit.vision.barcode.common.Barcode

/**
 * View customizada para desenhar os 4 pontos amarelos (cornerPoints) do QR Code
 * detectado pelo Google ML Kit Barcode Scanning
 */
class BarcodeOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val cornerPaint = Paint().apply {
        color = Color.YELLOW
        style = Paint.Style.FILL
        strokeWidth = 8f
        isAntiAlias = true
    }

    private val boxPaint = Paint().apply {
        color = Color.YELLOW
        style = Paint.Style.STROKE
        strokeWidth = 6f
        isAntiAlias = true
    }

    private val debugPaint = Paint().apply {
        color = Color.RED
        style = Paint.Style.FILL
        textSize = 30f
        isAntiAlias = true
    }

    private var cornerPoints: Array<PointF>? = null
    private var transformationMatrix = Matrix()
    private var imageWidth = 0
    private var imageHeight = 0
    private var imageRotation = 0

    /**
     * Define as informações da imagem fonte do ML Kit
     * @param width Largura da imagem processada pelo ML Kit
     * @param height Altura da imagem processada pelo ML Kit
     * @param rotation Rotação da imagem em graus
     */
    fun setImageSourceInfo(width: Int, height: Int, rotation: Int) {
        imageWidth = width
        imageHeight = height
        imageRotation = rotation
        calculateTransformationMatrix()
        Log.d("MLKitScanner", "📐 Imagem ML Kit: ${width}x${height}, Rotação: ${rotation}°")
    }

    /**
     * Calcula a matriz de transformação para converter coordenadas da imagem para coordenadas da tela
     */
    private fun calculateTransformationMatrix() {
        if (imageWidth == 0 || imageHeight == 0 || width == 0 || height == 0) {
            return
        }

        transformationMatrix.reset()

        // Aplicar rotação se necessário
        when (imageRotation) {
            90 -> {
                transformationMatrix.postRotate(90f)
                transformationMatrix.postTranslate(imageHeight.toFloat(), 0f)
            }
            180 -> {
                transformationMatrix.postRotate(180f)
                transformationMatrix.postTranslate(imageWidth.toFloat(), imageHeight.toFloat())
            }
            270 -> {
                transformationMatrix.postRotate(270f)
                transformationMatrix.postTranslate(0f, imageWidth.toFloat())
            }
        }

        // Calcular escala para mapear imagem para view
        val scaleX: Float
        val scaleY: Float
        val translateX: Float
        val translateY: Float

        // Dimensões após rotação
        val rotatedWidth = if (imageRotation == 90 || imageRotation == 270) imageHeight else imageWidth
        val rotatedHeight = if (imageRotation == 90 || imageRotation == 270) imageWidth else imageHeight

        // Calcular escala mantendo aspect ratio
        val imageAspectRatio = rotatedWidth.toFloat() / rotatedHeight.toFloat()
        val viewAspectRatio = width.toFloat() / height.toFloat()

        if (imageAspectRatio > viewAspectRatio) {
            // Imagem mais larga, escalar por largura
            scaleX = width.toFloat() / rotatedWidth.toFloat()
            scaleY = scaleX
            translateX = 0f
            translateY = (height - (rotatedHeight * scaleY)) / 2f
        } else {
            // Imagem mais alta, escalar por altura
            scaleY = height.toFloat() / rotatedHeight.toFloat()
            scaleX = scaleY
            translateX = (width - (rotatedWidth * scaleX)) / 2f
            translateY = 0f
        }

        transformationMatrix.postScale(scaleX, scaleY)
        transformationMatrix.postTranslate(translateX, translateY)

        Log.d("MLKitScanner", "📐 View: ${width}x${height}")
        Log.d("MLKitScanner", "📐 Escala: ${scaleX}x${scaleY}, Translate: ${translateX}x${translateY}")
    }

    /**
     * Transforma um ponto das coordenadas da imagem para coordenadas da tela
     */
    private fun transformPoint(point: android.graphics.Point): PointF {
        val pointArray = floatArrayOf(point.x.toFloat(), point.y.toFloat())
        transformationMatrix.mapPoints(pointArray)
        return PointF(pointArray[0], pointArray[1])
    }

    /**
     * Atualiza os cornerPoints do QR Code detectado
     * @param barcode Barcode detectado pelo ML Kit contendo os cornerPoints
     */
    fun updateBarcodeCorners(barcode: Barcode?) {
        val originalPoints = barcode?.cornerPoints
        
        if (originalPoints != null && originalPoints.isNotEmpty()) {
            Log.d("MLKitScanner", "📍 cornerPoints ORIGINAL: ${originalPoints.contentToString()}")
            
            // Transformar pontos da imagem para coordenadas da tela
            cornerPoints = originalPoints.map { point ->
                transformPoint(point)
            }.toTypedArray()
            
            Log.d("MLKitScanner", "📍 cornerPoints TRANSFORMADO: ${cornerPoints?.contentToString()}")
        } else {
            cornerPoints = null
        }
        
        invalidate() // Redesenha a view
    }

    /**
     * Limpa os pontos da tela
     */
    fun clear() {
        cornerPoints = null
        invalidate()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // Recalcular transformação quando o tamanho da view mudar
        calculateTransformationMatrix()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // Debug: desenhar cruz vermelha no centro para confirmar que overlay está funcionando
        canvas.drawLine(width / 2f - 50f, height / 2f, width / 2f + 50f, height / 2f, debugPaint)
        canvas.drawLine(width / 2f, height / 2f - 50f, width / 2f, height / 2f + 50f, debugPaint)

        val points = cornerPoints ?: return

        if (points.size == 4) {
            // Desenha linha conectando os 4 cantos (bounding box do QR Code)
            canvas.drawLine(points[0].x, points[0].y, points[1].x, points[1].y, boxPaint)
            canvas.drawLine(points[1].x, points[1].y, points[2].x, points[2].y, boxPaint)
            canvas.drawLine(points[2].x, points[2].y, points[3].x, points[3].y, boxPaint)
            canvas.drawLine(points[3].x, points[3].y, points[0].x, points[0].y, boxPaint)

            // Desenha círculos amarelos nos 4 cantos
            for ((index, point) in points.withIndex()) {
                canvas.drawCircle(point.x, point.y, 20f, cornerPaint)
                // Debug: mostrar coordenadas
                canvas.drawText("${index}: (${point.x.toInt()}, ${point.y.toInt()})", 
                    point.x + 30f, point.y, debugPaint)
            }
        }
    }
}
