// =========================
// FORMATO CLP
// =========================
const formatoCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

// =========================
// ELEMENTOS HTML
// =========================
const boletaElement = document.querySelector(".contenedor-boleta");
const detalleTabla = document.getElementById("detalle-body");
const botonImprimir = document.getElementById("boton-imprimir");
const botonWhatsapp = document.getElementById("boton-whatsapp");

// =========================
// FUNCIÓN PRINCIPAL: RENDERIZAR BOLETA
// =========================
function cargarBoleta(data) {
  // DATOS EMPRESA Y SUCURSAL
  document.getElementById("empresa").textContent = data.empresa;
  document.getElementById("rut_empresa").textContent = data.rut_empresa;
  document.getElementById("sucursal").textContent = data.sucursal;
  document.getElementById("direccion").textContent = data.direccion;

  // FECHA, BOLETA Y PEDIDO
  document.getElementById("fecha").textContent = data.fecha;
  document.getElementById("pedido").textContent = data.numero_pedido;
  document.getElementById("folio").textContent = data.folio;

  // CLIENTE
  document.getElementById("cliente").textContent =
    data.cliente || "Consumidor Final";
  document.getElementById("rut_cliente").textContent =
    data.rut_cliente || "---";

  // PAGO
  document.getElementById("pago").textContent =
    data.metodo_pago || "No informado";

  // TOTALES
  document.getElementById("total_neto").textContent = formatoCLP.format(
    data.total_neto
  );
  document.getElementById("iva").textContent = formatoCLP.format(data.iva);
  document.getElementById("total_general").textContent = formatoCLP.format(
    data.total
  );

  // =========================
  // DETALLE DE PRODUCTOS
  // =========================
  detalleTabla.innerHTML = ""; // limpiar antes

  data.detalles.forEach((d) => {
    // FILA PRINCIPAL PRODUCTO
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.cantidad}</td>
      <td>${d.descripcion}</td>
      <td>${formatoCLP.format(d.precio_unitario)}</td>
      <td>${formatoCLP.format(d.total_linea)}</td>
    `;
    detalleTabla.appendChild(tr);

    // MODIFICADORES DE ESE DETALLE
    if (d.modificadores && d.modificadores.length > 0) {
      d.modificadores.forEach((m) => {
        const trm = document.createElement("tr");
        trm.innerHTML = `
          <td></td>
          <td style="padding-left:20px;">- ${m.nombre}</td>
          <td>${formatoCLP.format(m.valor)}</td>
          <td>${formatoCLP.format(m.valor)}</td>
        `;
        detalleTabla.appendChild(trm);
      });
    }
  });
}

// =========================
// BOTÓN IMPRIMIR
// =========================
botonImprimir.addEventListener("click", () => {
  window.print();
});

// =========================
// BOTÓN WHATSAPP
// =========================
botonWhatsapp.addEventListener("click", async () => {
  if (!("share" in navigator) || !("canShare" in navigator)) {
    window.open(
      "https://wa.me/56963540147?text=" +
        encodeURIComponent("Te envío la boleta"),
      "_blank"
    );
    return;
  }

  const canvas = await html2canvas(boletaElement, {
    backgroundColor: "#fff",
    scale: 2,
    ignoreElements: (element) =>
      element.classList.contains("html2canvas-ignore"),
  });

  canvas.toBlob(async (blob) => {
    const file = new File([blob], `boleta_${Date.now()}.png`, {
      type: "image/png",
    });

    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Boleta",
        text: "Te envío la boleta",
      });
    } else {
      window.open(
        "https://wa.me/56963540147?text=" +
          encodeURIComponent("Te envío la boleta"),
        "_blank"
      );
    }
  }, "image/png");
});