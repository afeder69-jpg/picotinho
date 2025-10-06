package app.lovable.b5ea6089d5bc4939b83e6c590c392e34

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PointF
import android.util.AttributeSet
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

    private var cornerPoints: Array<PointF>? = null

    /**
     * Atualiza os cornerPoints do QR Code detectado
     * @param barcode Barcode detectado pelo ML Kit contendo os cornerPoints
     */
    fun updateBarcodeCorners(barcode: Barcode?) {
        cornerPoints = barcode?.cornerPoints?.map { point ->
            PointF(point.x.toFloat(), point.y.toFloat())
        }?.toTypedArray()
        
        invalidate() // Redesenha a view
    }

    /**
     * Limpa os pontos da tela
     */
    fun clear() {
        cornerPoints = null
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val points = cornerPoints ?: return

        if (points.size == 4) {
            // Desenha linha conectando os 4 cantos (bounding box do QR Code)
            canvas.drawLine(points[0].x, points[0].y, points[1].x, points[1].y, boxPaint)
            canvas.drawLine(points[1].x, points[1].y, points[2].x, points[2].y, boxPaint)
            canvas.drawLine(points[2].x, points[2].y, points[3].x, points[3].y, boxPaint)
            canvas.drawLine(points[3].x, points[3].y, points[0].x, points[0].y, boxPaint)

            // Desenha círculos amarelos nos 4 cantos
            for (point in points) {
                canvas.drawCircle(point.x, point.y, 20f, cornerPaint)
            }
        }
    }
}
