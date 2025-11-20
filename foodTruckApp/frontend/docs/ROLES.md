# 👥 Roles y Flujos de Usuario

El sistema FoodTruckApp define tres roles principales, cada uno con permisos y vistas específicas para optimizar la operación.

## 1. Administrador (Dueño)
**Acceso Total**: El administrador tiene control completo sobre la configuración del negocio.

### Funcionalidades Clave
*   **Gestión de Usuarios**: Crear, editar y eliminar cuentas para supervisores y vendedores.
*   **Gestión de Productos**:
    *   Crear categorías (e.g., "Bebidas", "Sandwiches").
    *   Administrar productos, precios e imágenes.
    *   Configurar modificadores (e.g., "Sin cebolla", "Extra queso").
*   **Reportes Globales**: Visualización de ventas históricas y métricas de rendimiento.

### Flujo Típico
1.  Login -> Dashboard Admin.
2.  Configuración de Catálogo (Carga inicial de productos).
3.  Creación de Usuarios para el personal.

---

## 2. Supervisor (Jefe de Turno)
**Gestión Operativa**: Responsable del funcionamiento diario del Food Truck.

### Funcionalidades Clave
*   **Apertura y Cierre de Caja**:
    *   Registrar monto inicial.
    *   Arqueo de caja al finalizar el turno.
*   **Gestión de Turnos**: Iniciar y finalizar la jornada laboral del equipo.
*   **Supervisión de Ventas**: Ver transacciones del día en curso.
*   **Anulaciones**: Autorizar la anulación de pedidos erróneos.

### Flujo Típico
1.  Login -> Panel de Operaciones.
2.  **Inicio de Día**: Apertura de caja.
3.  **Durante el Turno**: Monitoreo y resolución de incidencias.
4.  **Fin de Día**: Cierre de caja y generación de reporte diario.

---

## 3. Vendedor (Cajero)
**Punto de Venta (POS)**: Enfocado en la velocidad y precisión de la toma de pedidos.

### Funcionalidades Clave
*   **Toma de Pedidos**: Interfaz táctil optimizada para seleccionar productos rápidamente.
*   **Personalización**: Agregar notas o modificadores a los ítems.
*   **Cobro**: Procesar pagos (Efectivo, Tarjeta, Transferencia).
*   **Historial Reciente**: Ver y reimprimir tickets recientes.

### Flujo Típico
1.  Login (o cambio de usuario rápido) -> Vista de Venta.
2.  Selección de Categoría -> Selección de Productos.
3.  Confirmación de Pedido -> Selección de Método de Pago.
4.  Emisión de Comprobante.

---

## 🔐 Matriz de Permisos

| Funcionalidad | Administrador | Supervisor | Vendedor |
| :--- | :---: | :---: | :---: |
| Configuración Global | ✅ | ❌ | ❌ |
| Gestión de Usuarios | ✅ | ❌ | ❌ |
| Editar Productos | ✅ | ❌ | ❌ |
| Apertura/Cierre Caja | ✅ | ✅ | ❌ |
| Anular Pedidos | ✅ | ✅ | ❌ |
| Tomar Pedidos | ✅ | ✅ | ✅ |
| Ver Reportes | ✅ | ✅ | ❌ |
