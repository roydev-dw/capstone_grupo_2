# core/services/boleta_pdf_service.py

from io import BytesIO
import requests
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

from core.models import (
    Boleta,
    PedidoDetalle,
    PedidoDetalleModificador,
    Pago,
)

from core.azure_blob import upload_boleta_pdf


TICKET_WIDTH = 80 * mm  # ancho ticket térmico estándar


def generar_pdf_boleta(boleta: Boleta) -> bytes:
    """
    Genera un PDF tipo ticket térmico basado en tus modelos reales.
    Devuelve bytes listos para subir a Azure Blob.
    """

    # ========= DESCARGAR LOGO (desde Azure Blob) ==========
    logo_url = "https://imagenesappfoodtruck.blob.core.windows.net/imagenes/icono-logo-copia.png"

    try:
        resp = requests.get(logo_url)
        resp.raise_for_status()
        logo_img = ImageReader(BytesIO(resp.content))
    except Exception:
        logo_img = None  # si falla, seguimos sin logo

    pedido = boleta.pedido
    suc = pedido.sucursal
    empresa = getattr(suc, "empresa", None)

    detalles = (
        PedidoDetalle.objects
        .filter(pedido=pedido)
        .select_related("producto")
    )

    pago = (
        Pago.objects
        .filter(pedido=pedido)
        .select_related("metodo_pago")
        .first()
    )
    metodo_pago_nombre = pago.metodo_pago.nombre if pago else "No informado"

    # ========= CREAR PDF ==========
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(TICKET_WIDTH, 300 * mm))
    y = 270 * mm

    # ========= LOGO ==========
    if logo_img:
        logo_width = 40 * mm
        logo_height = 40 * mm
        x = (TICKET_WIDTH - logo_width) / 2

        pdf.drawImage(
            logo_img,
            x,
            y - logo_height,
            width=logo_width,
            height=logo_height,
            preserveAspectRatio=True,
            mask="auto"
        )

        y -= (logo_height + 6 * mm)

    # ========= ENCABEZADO ==========
    pdf.setFont("Helvetica-Bold", 10)
    razon_social = (
        empresa.nombre
        if empresa is not None and hasattr(empresa, "nombre")
        else "FOODTRUCK"
    )
    pdf.drawCentredString(TICKET_WIDTH / 2, y, razon_social)
    y -= 6 * mm

    pdf.setFont("Helvetica", 8)
    if empresa is not None and hasattr(empresa, "rut"):
        pdf.drawCentredString(TICKET_WIDTH / 2, y, f"RUT: {empresa.rut}")
        y -= 5 * mm

    direccion = getattr(suc, "direccion", "")
    pdf.drawCentredString(TICKET_WIDTH / 2, y, f"{suc.nombre} - {direccion}")
    y -= 6 * mm

    pdf.drawCentredString(
        TICKET_WIDTH / 2,
        y,
        boleta.fecha_emision.strftime("Fecha: %d-%m-%Y  Hora: %H:%M"),
    )
    y -= 8 * mm

    pdf.line(0, y, TICKET_WIDTH, y)
    y -= 5 * mm

    # ========= TITULOS ==========
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(2 * mm, y, "Descripción")
    pdf.drawRightString(TICKET_WIDTH - 2 * mm, y, "Total")
    y -= 5 * mm

    pdf.line(0, y, TICKET_WIDTH, y)
    y -= 4 * mm

    # ========= ITEMS ==========
    pdf.setFont("Helvetica", 8)

    for d in detalles:
        nombre = d.producto.nombre
        total_linea = d.total_linea

        pdf.drawString(2 * mm, y, f"{d.cantidad} x {nombre[:25]}")
        pdf.drawRightString(
            TICKET_WIDTH - 2 * mm,
            y,
            f"{int(total_linea):,}".replace(",", "."),
        )
        y -= 5 * mm

        # ===== MODIFICADORES =====
        mods = (
            PedidoDetalleModificador.objects
            .filter(detalle=d)
            .select_related("modificador")
        )

        for m in mods:
            texto = f"- {m.modificador.nombre}"
            if m.es_gratuito:
                valor = "0"
            else:
                valor = f"{int(m.valor_aplicado):,}".replace(",", ".")

            pdf.drawString(4 * mm, y, texto[:28])
            pdf.drawRightString(TICKET_WIDTH - 2 * mm, y, valor)
            y -= 4 * mm

    pdf.line(0, y, TICKET_WIDTH, y)
    y -= 5 * mm

    # ========= TOTALES ==========
    pdf.setFont("Helvetica-Bold", 9)

    pdf.drawString(2 * mm, y, "Subtotal")
    pdf.drawRightString(
        TICKET_WIDTH - 2 * mm,
        y,
        f"{int(pedido.total_bruto):,}".replace(",", "."),
    )
    y -= 5 * mm

    if pedido.descuento_total and pedido.descuento_total > 0:
        pdf.drawString(2 * mm, y, "Descuento")
        pdf.drawRightString(
            TICKET_WIDTH - 2 * mm,
            y,
            f"-{int(pedido.descuento_total):,}".replace(",", "."),
        )
        y -= 5 * mm

    pdf.drawString(2 * mm, y, "IVA 19%")
    pdf.drawRightString(
        TICKET_WIDTH - 2 * mm,
        y,
        f"{int(pedido.iva):,}".replace(",", "."),
    )
    y -= 5 * mm

    pdf.drawString(2 * mm, y, "TOTAL")
    pdf.drawRightString(
        TICKET_WIDTH - 2 * mm,
        y,
        f"{int(boleta.monto_total):,}".replace(",", "."),
    )
    y -= 7 * mm

    pdf.line(0, y, TICKET_WIDTH, y)
    y -= 6 * mm

    # ========= INFO FINAL ==========
    pdf.setFont("Helvetica", 8)

    pdf.drawString(2 * mm, y, f"Método de pago: {metodo_pago_nombre}")
    y -= 5 * mm

    pdf.drawString(2 * mm, y, f"Pedido: {pedido.numero_pedido}")
    y -= 4 * mm

    pdf.drawString(2 * mm, y, f"Boleta Nº: {boleta.folio}")
    y -= 6 * mm

    pdf.line(0, y, TICKET_WIDTH, y)
    y -= 6 * mm

    pdf.setFont("Helvetica-Oblique", 8)
    pdf.drawCentredString(TICKET_WIDTH / 2, y, "Gracias por preferirnos!")
    y -= 6 * mm

    pdf.showPage()
    pdf.save()

    return buffer.getvalue()


def generar_y_subir_pdf_boleta(boleta: Boleta) -> str:
    """
    Genera el PDF de la boleta, lo sube a Azure Blob y guarda la URL en la boleta.
    Retorna la URL final.
    """
    # 1) Generar PDF en memoria
    pdf_bytes = generar_pdf_boleta(boleta)

    # 2) Nombre archivo
    filename = f"boleta_{boleta.folio}.pdf"

    # 3) Subir usando tu helper de azure_blob
    url = upload_boleta_pdf(
        boleta_id=boleta.boleta_id,
        file_bytes=pdf_bytes,
        filename=filename,
    )

    # 4) Guardar en BD
    boleta.url_pdf = url
    boleta.save(update_fields=["url_pdf"])

    return url