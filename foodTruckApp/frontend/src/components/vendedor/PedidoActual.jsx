import React, { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { pedidosRepo } from '../../utils/repoPedidos';
import { webpayRepo } from '../../utils/repoWebpay';
import { boletasRepo } from '../../utils/repoBoletas';
import { HiXMark } from 'react-icons/hi2';
import { FaEdit } from 'react-icons/fa';
import { IoTrash } from 'react-icons/io5';

// 👇 log garantizado al cargar el módulo
console.log('%c[PEDIDO] PedidoActual.jsx cargado', 'color:#ff0;font-weight:bold');

export const PedidoActual = React.memo(function PedidoActual({
  cart = [],
  onClearCart = () => {},
  onAgregarAlCarrito = () => {},
  onRemoverDelCarrito = () => {},
  onEditarItem = () => {},
  onEliminarItem = () => {},
  onClose,
  sucursalId,
  usuarioId,
  onPedidoConfirmado = () => {},
}) {
  const [procesando, setProcesando] = useState(false);
  const [modoPago, setModoPago] = useState('');

  const generarBoletaLocal = ({ numeroPedido, subtotal, impuesto, total, cartItems }) => {
    try {
      const fecha = new Date().toLocaleString();
      const filas = (cartItems || [])
        .map((item) => {
          const extras = item.selectedOptions
            ? Object.values(item.selectedOptions).map(
                (opt) =>
                  `<div style="color:#555;font-size:12px;">- ${opt.name || ''}${
                    typeof opt.extraPrice === 'number'
                      ? ` (+$${Math.round(opt.extraPrice).toLocaleString('es-CL')})`
                      : ''
                  }</div>`
              )
            : [];
          return `<tr>
              <td style="padding:4px 8px;">
                <div>${item.name || item.id}</div>
                ${extras.join('')}
              </td>
              <td style="padding:4px 8px; text-align:center;">${item.quantity}</td>
              <td style="padding:4px 8px; text-align:right;">$${Math.round(
                item.precioFinalUnitario || item.price || 0
              ).toLocaleString('es-CL')}</td>
            </tr>`;
        })
        .join('');

      const html = `
        <html>
          <head>
            <title>Boleta ${numeroPedido || ''}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 12px; }
              h1 { font-size: 18px; margin: 0 0 8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; }
              td { border-bottom: 1px solid #f0f0f0; font-size: 13px; }
              .totales { margin-top: 12px; }
              .totales div { display: flex; justify-content: space-between; margin: 4px 0; }
            </style>
          </head>
          <body>
            <h1>Boleta (offline)</h1>
            <p style="margin:4px 0;">N°: ${numeroPedido || 'Pendiente'}</p>
            <p style="margin:4px 0;">Fecha: ${fecha}</p>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th style="text-align:right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${filas}
              </tbody>
            </table>
            <div class="totales">
              <div><span>Subtotal</span><strong>$${Math.round(subtotal).toLocaleString('es-CL')}</strong></div>
              <div><span>IVA (19%)</span><strong>$${Math.round(impuesto).toLocaleString('es-CL')}</strong></div>
              <div><span>Total</span><strong>$${Math.round(total).toLocaleString('es-CL')}</strong></div>
            </div>
            <p style="margin-top:12px;font-size:12px;color:#555;">Boleta generada sin conexion. Se sincronizara cuando vuelva internet.</p>
            <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200); };</script>
          </body>
        </html>
      `;

      const win = window.open('', '_blank', 'width=600,height=800');
      if (win) {
        win.document.write(html);
        win.document.close();
      } else {
        console.warn('[PEDIDO] No se pudo abrir ventana para imprimir boleta offline');
      }
    } catch (err) {
      console.error('[PEDIDO] Error generando boleta offline', err);
    }
  };

  // 👇 log garantizado en cada render
  console.log('%c[PEDIDO] Render PedidoActual', 'color:#ff0;font-weight:bold', {
    cartLength: cart.length,
    sucursalId,
    usuarioId,
    procesando,
    modoPago,
  });

  const { subtotal, impuesto, totalPagar } = useMemo(() => {
    const sb = cart.reduce((sum, item) => sum + item.precioFinalUnitario * item.quantity, 0);

    const IVA = 0.19;
    const impuestoCalc = Math.round(sb * IVA);
    const totalCalc = sb + impuestoCalc;

    return {
      subtotal: sb, // neto
      impuesto: impuestoCalc,
      totalPagar: totalCalc,
    };
  }, [cart]);

  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(value);

  const confirmarEnabled = cart.length > 0;

  const handlePagar = async () => {
    console.log('%c[PEDIDO] handlePagar CLICK', 'color:#0ff;font-weight:bold', {
      confirmarEnabled,
      procesando,
      sucursalId,
      usuarioId,
    });

    try {
      if (!confirmarEnabled || procesando) {
        console.log('%c[PEDIDO] handlePagar abortado por disabled/creando', 'color:#f90', {
          confirmarEnabled,
          procesando,
        });
        return;
      }

      if (!sucursalId) {
        console.warn('[PEDIDO] No hay sucursalId, abortando creación de pedido');
        toast.error('No hay sucursal seleccionada para crear el pedido.');
        return;
      }
      if (!usuarioId) {
        console.warn('[PEDIDO] No hay usuarioId, abortando creación de pedido');
        toast.error('No hay usuario asignado para crear el pedido.');
        return;
      }

      setProcesando(true);
      setModoPago('webpay');

      // --- PASO 1: CABECERA ---
      const payloadCabecera = {
        sucursalId,
        usuarioId,
        subtotal,
        iva: impuesto,
        total: totalPagar,
        tipoVenta: 'Local',
        esOffline: false,
        descuentoTotal: 0,
        numeroPedido: undefined,
      };

      console.log('%c[PEDIDO] Payload cabecera', 'color:#0af;font-weight:bold', payloadCabecera);

      const pedidoCreado = await pedidosRepo.createCabecera(payloadCabecera);

      console.log('%c[PEDIDO] Respuesta backend cabecera', 'color:#0f0;font-weight:bold', pedidoCreado);

      const pedidoId = pedidoCreado?.pedido_id ?? pedidoCreado?.id;
      if (!pedidoId) {
        throw new Error('No se obtuvo pedido_id para crear los detalles');
      }

      // --- PASO 2: DETALLES + MODS ---
      console.log(
        '%c[PEDIDO] Creando detalles+mods para pedido_id =',
        'color:#f0f;font-weight:bold',
        pedidoId,
        'con cart:',
        cart
      );

      const detallesResultado = await pedidosRepo.createDetallesWithModificadores(pedidoId, cart);

      console.log('%c[PEDIDO] Detalles+mods creados en backend', 'color:#f0f;font-weight:bold', detallesResultado);

      // --- PASO 3: INICIAR WEBPAY ---
      // Ruta del frontend a la que Webpay va a volver
      const returnUrl = `${window.location.origin}/resultado`; // debe coincidir con <Route path="/resultado" ...>

      console.log('%c[WEBPAY] init params', 'color:#0af;font-weight:bold', {
        pedidoId,
        monto: totalPagar,
        returnUrl,
      });

      const webpayInit = await webpayRepo.init({
        pedidoId,
        monto: totalPagar,
        returnUrl,
      });

      console.log('%c[WEBPAY] init respuesta', 'color:#0f0;font-weight:bold', webpayInit);

      if (!webpayInit?.ok || !webpayInit?.token || !webpayInit?.url) {
        console.error('[WEBPAY] init devolvió algo inesperado', webpayInit);
        toast.error('No se pudo iniciar el pago con Webpay.');
        return;
      }

      // Guardamos info básica para que WebpayResultado pueda consultar la transacción
      try {
        const info = {
          pedido_id: pedidoId,
          transaccion_id: webpayInit?.transaccion_id ?? null,
          total: Math.round(totalPagar),
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem('lastWebpayTx', JSON.stringify(info));
        console.log('%c[WEBPAY] lastWebpayTx guardado', 'color:#ff0;font-weight:bold', info);
      } catch (e) {
        console.warn('[WEBPAY] No se pudo guardar lastWebpayTx en localStorage', e);
      }

      // Avisamos al padre que ya existe todo en backend
      onPedidoConfirmado({
        pedido: pedidoCreado,
        detalles: detallesResultado,
        webpay: webpayInit,
      });

      // Si prefieres limpiar el carrito después del commit, esto se puede mover a la pantalla de resultado
      onClearCart();

      // --- PASO 4: REDIRIGIR A WEBPAY ---
      webpayRepo.redirectToWebpay({
        token: webpayInit.token,
        url: webpayInit.url,
      });
    } catch (err) {
      console.error('%c[PEDIDO] Error en handlePagar', 'color:#f00;font-weight:bold', err);
      const msg =
        err?.data?.detail || err?.data?.message || err?.message || 'No se pudo crear el pedido ni iniciar Webpay';
      toast.error(msg);
    } finally {
      setProcesando(false);
      setModoPago('');
    }
  };

  const handlePagarEfectivo = async () => {
    console.log('%c[PEDIDO] handlePagarEfectivo CLICK', 'color:#0ff;font-weight:bold', {
      confirmarEnabled,
      procesando,
      sucursalId,
      usuarioId,
    });

    try {
      if (!confirmarEnabled || procesando) {
        console.log('%c[PEDIDO] handlePagarEfectivo abortado por disabled/procesando', 'color:#f90', {
          confirmarEnabled,
          procesando,
        });
        return;
      }

      if (!sucursalId) {
        console.warn('[PEDIDO] No hay sucursalId, abortando creaci��n de pedido en efectivo');
        toast.error('No hay sucursal seleccionada para crear el pedido.');
        return;
      }
      if (!usuarioId) {
        console.warn('[PEDIDO] No hay usuarioId, abortando creaci��n de pedido en efectivo');
        toast.error('No hay usuario asignado para crear el pedido.');
        return;
      }

      setProcesando(true);
      setModoPago('cash');

      const resultado = await pedidosRepo.registrarPagoEfectivo({
        sucursalId,
        usuarioId,
        subtotal,
        iva: impuesto,
        total: totalPagar,
        cartItems: cart,
        descuentoTotal: 0,
        numeroPedido: undefined,
        tipoVenta: 'Local',
      });

      if (resultado?.status === 'online') {
        toast.success('Pago en efectivo registrado.');
        onPedidoConfirmado({
          pedido: resultado?.pedido,
          detalles: resultado?.detalles,
          pedidoId: resultado?.pedidoId,
          metodo: 'efectivo',
          offline: false,
        });

        // Emitir y abrir boleta en PDF
        if (resultado?.pedidoId) {
          try {
            const { boletaId, pdfResp } = await boletasRepo.emitirYGenerarPdf({
              pedidoId: resultado.pedidoId,
            });
            const url = pdfResp?.urlPdf;
            if (url) {
              window.open(url, '_blank');
            } else {
              toast.error('No se recibió la URL de la boleta para imprimir.');
            }
            console.log('[PEDIDO] Boleta emitida', { boletaId, url });
          } catch (boletaErr) {
            console.error('[PEDIDO] No se pudo emitir/abrir boleta en efectivo', boletaErr);
            toast.error('El pedido se guardó, pero la boleta no se pudo generar.');
          }
        }
      } else {
        toast.success('Venta guardada para sincronizar cuando vuelva internet.');
        onPedidoConfirmado({
          entry: resultado?.entry,
          metodo: 'efectivo',
          offline: true,
        });
        const numeroLocal =
          resultado?.entry?.payload?.cabecera?.numeroPedido ||
          resultado?.entry?.payload?.cabecera?.numero_pedido ||
          `PED-${Date.now()}`;
        generarBoletaLocal({
          numeroPedido: numeroLocal,
          subtotal,
          impuesto,
          total: totalPagar,
          cartItems: cart,
        });
      }

      onClearCart();
    } catch (err) {
      console.error('%c[PEDIDO] Error en pago en efectivo', 'color:#f00;font-weight:bold', err);
      const msg =
        err?.data?.detail || err?.data?.message || err?.message || 'No se pudo registrar el pago en efectivo.';
      toast.error(msg);
    } finally {
      setProcesando(false);
      setModoPago('');
    }
  };

  return (
    <aside
      className='
        h-screen sticky top-0
        w-full 
        p-4 lg:p-8 bg-fondo lg:bg-primario/5 shadow-lg lg:shadow-none
        flex flex-col justify-between border-l-2 border-l-primario
      '
      aria-label='Pedido actual'>
      <div className='flex-1 overflow-y-auto overflow-x-hidden'>
        <div className='flex justify-between items-center mb-4 lg:mb-6'>
          <h2 className='text-lg font-bold'>Pedido Actual</h2>
          {onClose && (
            <button
              onClick={onClose}
              className='p-1 rounded-full hover:bg-black/10 lg:hidden'
              aria-label='Cerrar pedido'>
              <HiXMark className='h-6 w-6' />
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <p className='text-placeholder flex-1 min-h-[120px]'>No hay productos en el pedido.</p>
        ) : (
          <ul className='flex-1 space-y-2 overflow-y-auto pr-2'>
            {cart.map((item) => {
              const extrasTotal = item.selectedOptions
                ? Object.values(item.selectedOptions).reduce((sum, eleccion) => sum + (eleccion.extraPrice || 0), 0)
                : 0;

              const basePrice = (item.precioFinalUnitario || 0) - extrasTotal;
              const itemSubtotal = (item.precioFinalUnitario || 0) * item.quantity;

              return (
                <li
                  key={item.idItemCarrito}
                  className='flex justify-between items-center gap-3 py-3 border-b border-gray-200'
                  aria-live='polite'>
                  <div className='flex flex-col gap-2 flex-1 min-w-0'>
                    <p className='font-medium text-pretty truncate'>{item.name}</p>

                    {item.selectedOptions && (
                      <div className='pl-2'>
                        {Object.entries(item.selectedOptions).map(([opcion, eleccion]) => (
                          <p key={opcion} className='text-placeholder text-sm'>
                            - {eleccion.name}{' '}
                            {typeof eleccion.extraPrice === 'number' && (
                              <span className='text-texto/50'>(+{formatCurrency(eleccion.extraPrice)})</span>
                            )}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className='flex items-center gap-2 flex-wrap mt-1'>
                      <div className='flex items-center gap-1 border border-gray-300 rounded-md'>
                        <button
                          type='button'
                          aria-label={`Disminuir cantidad de ${item.name}`}
                          onClick={() => onRemoverDelCarrito(item.idItemCarrito)}
                          className='px-2 py-0.5 rounded-l-md hover:bg-gray-100'
                          disabled={item.quantity <= 1}>
                          <span className='text-lg'>−</span>
                        </button>
                        <span className='px-2 text-sm font-bold min-w-[28px] text-center'>{item.quantity}</span>
                        <button
                          type='button'
                          aria-label={`Aumentar cantidad de ${item.name}`}
                          onClick={() =>
                            onAgregarAlCarrito({
                              ...item,
                              quantity: 1,
                            })
                          }
                          className='px-2 py-0.5 rounded-r-md hover:bg-gray-100'>
                          <span className='text-lg'>+</span>
                        </button>
                      </div>

                      {item.selectedOptions && (
                        <button
                          type='button'
                          onClick={() => onEditarItem(item.idItemCarrito)}
                          className='p-2 rounded-full text-primario hover:scale-150 transition duration-200 ease-in-out'
                          aria-label={`Editar opciones de ${item.name}`}>
                          <FaEdit className='h-6 w-6' />
                        </button>
                      )}

                      <button
                        type='button'
                        onClick={() => onEliminarItem(item.idItemCarrito)}
                        className='p-2 rounded-full text-secundario hover:scale-150 transition duration-200 ease-in-out'
                        aria-label={`Eliminar ${item.name} del pedido`}>
                        <IoTrash className='h-6 w-6' />
                      </button>
                    </div>
                  </div>

                  <div className='flex flex-col items-end text-right flex-shrink-0 w-[90px] lg:w-[100px]'>
                    <p className='text-sm text-texto/70' title='Precio unitario'>
                      {formatCurrency(basePrice)}
                    </p>

                    {item.selectedOptions &&
                      Object.entries(item.selectedOptions).map(
                        ([opcion, eleccion]) =>
                          typeof eleccion.extraPrice === 'number' && (
                            <p key={opcion} className='text-sm text-texto/70' title={`Extra: ${eleccion.name}`}>
                              + {formatCurrency(eleccion.extraPrice)}
                            </p>
                          )
                      )}

                    <p className='font-bold mt-1' title='Subtotal item'>
                      {formatCurrency(itemSubtotal)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className='mt-4 lg:mt-6 border-t-2 border-primario pt-4'>
        <div className='space-y-1 mb-4'>
          <div className='flex justify-between items-center'>
            <span className='text-md'>Subtotal</span>
            <span className='text-md'>{formatCurrency(subtotal)}</span>
          </div>

          <div className='flex justify-between items-center text-placeholder'>
            <span className='text-sm'>IVA (19%)</span>
            <span className='text-sm'>{formatCurrency(impuesto)}</span>
          </div>

          <div className='flex justify-between items-center mt-2 pt-2 border-t border-dashed'>
            <span className='font-bold text-lg'>Total a Pagar</span>
            <span className='font-bold text-lg'>{formatCurrency(totalPagar)}</span>
          </div>
        </div>

        <div className='flex flex-col sm:flex-row gap-3'>
          <button
            type='button'
            onClick={onClearCart}
            className='flex-1 py-3 rounded-md font-semibold bg-secundario hover:bg-secundario/80 border border-border text-fondo transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed'
            disabled={!confirmarEnabled || procesando}>
            Cancelar
          </button>

          <button
            type='button'
            onClick={handlePagarEfectivo}
            className='flex-1 py-3 rounded-md font-semibold transition-all bg-emerald-600 text-white shadow-md hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed'
            disabled={!confirmarEnabled || procesando}>
            {procesando && modoPago === 'cash' ? 'Procesando...' : 'Pago en efectivo'}
          </button>

          <button
            type='button'
            onClick={handlePagar}
            className='flex-1 py-3 rounded-md font-semibold transition-all bg-primario text-white shadow-md hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed'
            disabled={!confirmarEnabled || procesando}>
            {procesando && modoPago === 'webpay' ? 'Procesando...' : 'Pago Webpay'}
          </button>
        </div>
      </div>
    </aside>
  );
});
