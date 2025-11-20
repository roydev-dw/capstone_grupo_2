# 🛡️ Datos, Seguridad y Aspectos Legales

## 💾 Gestión de Datos (Offline-First)

El núcleo de FoodTruckApp es su capacidad para operar sin conexión a internet.

### Modelo de Datos Local
Utilizamos **Dexie.js**, una capa sobre IndexedDB, para almacenar toda la información operativa en el dispositivo del usuario.
*   **Persistencia**: Productos, ventas, usuarios y sesiones se guardan localmente.
*   **Rendimiento**: Las consultas son inmediatas, eliminando la latencia de red en la operación crítica (venta).

### Sincronización
El módulo `syncManager.js` y `offlineQueue.js` gestionan la consistencia de datos:
1.  **Cola de Cambios**: Cada acción (crear venta, editar producto) se registra en una cola local si no hay internet.
2.  **Reintento Automático**: Cuando se detecta conexión, el sistema procesa la cola y envía los datos al servidor.
3.  **Resolución de Conflictos**: Se utiliza una estrategia "Last Write Wins" basada en timestamps para actualizaciones simples.

---

## 🔒 Seguridad

### Autenticación y Control de Acceso
*   **Sesiones Locales**: Gestión de sesión segura mediante `session.js`.
*   **Rutas Protegidas**: El componente `RutaProtegida.jsx` verifica el rol del usuario antes de renderizar vistas sensibles (e.g., solo Admin puede ver Configuración).
*   **Cifrado**: Las contraseñas se deben hashear antes de enviarse/almacenarse (Responsabilidad del Backend, pero el Frontend maneja el transporte seguro via HTTPS).

### Protección de Información
*   **Aislamiento**: IndexedDB respeta la política de mismo origen (Same-Origin Policy), impidiendo que otros sitios accedan a los datos del Food Truck.

---

## ⚖️ Aspectos Éticos y Legales

### Cumplimiento Ley 19.628 (Chile)
El proyecto se adhiere a la Ley sobre Protección de la Vida Privada:
1.  **Principio de Finalidad**: Los datos de los clientes (si se recolectan) se usan exclusivamente para la gestión del pedido y no se comparten con terceros.
2.  **Seguridad de los Datos**: Se implementan medidas técnicas (HTTPS, autenticación) para evitar accesos no autorizados.
3.  **Derechos ARCO**: El sistema permite la modificación y eliminación de datos de usuarios y registros por parte del Administrador, facilitando el derecho de cancelación.

### Uso Responsable
*   **Transparencia**: El sistema informa al usuario cuando está operando offline y cuando se están sincronizando datos.
*   **Minimización**: Solo se almacenan los datos estrictamente necesarios para la operación del negocio.
