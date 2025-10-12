/**
 * Muestra el resumen del pedido actual en una barra lateral.
 * @param {object} props
 * @param {Array} props.cart - Array de productos en el carrito.
 * @param {Function} props.onClearCart - Función para vaciar el carrito.
 */

export const PedidoActual = ({ cart = [], onClearCart }) => {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <aside className="w-2xl ml-auto h-full p-8 bg-surface flex flex-col">
      <h2 className="text-2xl font-bold mb-6">Pedido Actual</h2>

      {cart.length === 0 ? (
        <p className="text-muted flex-1">No hay productos en el pedido.</p>
      ) : (
        <ul className="flex-1 space-y-4 overflow-y-auto">
          {cart.map((item) => (
            <li key={item.id} className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-muted">
                  ${item.price.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-3 ">
                <button className="text-lg font-bold text-muted-soft">-</button>
                <span className="font-bold text-lg">{item.quantity}</span>
                <button className="text-lg font-bold text-accent-soft">
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 border-t border-border pt-6">
        <div className="flex justify-between font-bold text-xl mb-6">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
        <button className="w-full bg-primary-strong text-white py-3 rounded-card font-semibold hover:bg-primary-strong-hover transition-colors">
          Confirmar Venta
        </button>
        <button
          onClick={onClearCart}
          className="w-full mt-2 py-3 rounded-card font-semibold hover:bg-surface-muted transition-colors"
        >
          Cancelar
        </button>
      </div>
    </aside>
  );
};
