# 🌍 Visión General y Stack Tecnológico

## 🎯 Visión del Proyecto

**FoodTruckApp** es una solución integral diseñada para optimizar la gestión operativa de Food Trucks. El sistema aborda los desafíos únicos de este modelo de negocio, como la movilidad, la intermitencia de la conexión a internet y la necesidad de agilidad en la toma de pedidos.

### Objetivos Principales
1.  **Continuidad Operativa**: Garantizar el funcionamiento del punto de venta (POS) sin dependencia de internet.
2.  **Agilidad**: Interfaz optimizada para reducir el tiempo de toma de pedidos.
3.  **Control**: Gestión eficiente de inventario, caja y turnos de personal.

---

## 🛠️ Stack Tecnológico

La elección de tecnologías se basó en rendimiento, experiencia de desarrollo y requisitos de funcionamiento offline.

### Frontend Core
*   **[React 18](https://react.dev/)**: Biblioteca principal para la construcción de interfaces. Se utiliza el enfoque moderno con Hooks y Componentes Funcionales.
*   **[Vite](https://vitejs.dev/)**: Herramienta de construcción (bundler) de próxima generación. Elegido por su velocidad de arranque y Hot Module Replacement (HMR) instantáneo.

### Estilos y Diseño
*   **[Tailwind CSS v4](https://tailwindcss.com/)**: Framework de utilidades para un diseño rápido y consistente.
    *   *Configuración*: Se utiliza la versión 4 (alpha/beta según `package.json`) con soporte nativo de variables CSS.
    *   *Fuentes*: 'Luckiest Guy' (títulos) y 'Poppins' (cuerpo) vía `@fontsource`.
*   **React Icons**: Colección de iconos para una interfaz visual intuitiva.

### Gestión de Datos y Estado (Offline-First)
*   **[Dexie.js](https://dexie.org/)**: Wrapper para IndexedDB. Permite una base de datos local robusta en el navegador, esencial para la funcionalidad offline.
*   **React Query / Custom Hooks**: (Si aplica, o mencionar gestión de estado propia en `src/hooks`).
*   **Sync Manager**: Módulo personalizado (`src/utils/syncManager.js`) para sincronizar datos cuando se recupera la conexión.

### Formularios y Validación
*   **[React Hook Form](https://react-hook-form.com/)**: Manejo de formularios performante y flexible.
*   **[Yup](https://github.com/jquense/yup)**: Validación de esquemas de datos integrada con los formularios.

### PWA (Progressive Web App)
*   **vite-plugin-pwa**: Convierte la aplicación en instalable, permitiendo caché de assets y funcionamiento similar a una app nativa.

---

## 💡 Decisiones Técnicas Clave

### 1. Arquitectura "Offline-First"
La decisión más crítica fue priorizar el funcionamiento local.
*   **Por qué**: Los Food Trucks operan en festivales o ubicaciones con señal inestable.
*   **Implementación**: Todas las lecturas y escrituras ocurren primero en **Dexie (IndexedDB)**. Un proceso en segundo plano (`offlineQueue.js`) intenta sincronizar con el servidor cuando hay red.

### 2. Uso de Tailwind CSS
*   **Por qué**: Permite iterar rápidamente sobre el diseño sin salir del HTML/JSX. Facilita la creación de un sistema de diseño coherente mediante variables CSS personalizadas en `index.css`.

### 3. Separación de Repositorios
*   **Por qué**: Para desacoplar la lógica de la vista de la lógica de datos. Los archivos en `src/utils/repo*.js` actúan como una capa de abstracción sobre Dexie, facilitando cambios futuros en la persistencia.

---

## 🚀 Conclusiones y Aprendizajes

### Principales Logros Técnicos
*   Implementación exitosa de un sistema de sincronización bidireccional resiliente.
*   Interfaz de usuario altamente responsiva y estética, con tiempos de carga mínimos gracias a Vite.
*   Experiencia de usuario fluida incluso en condiciones de red adversas.

### Dificultades Superadas
*   **Manejo de Conflictos**: Resolver la sincronización de datos cuando múltiples dispositivos editan la misma entidad offline fue un desafío complejo, resuelto mediante colas y timestamps.
*   **Persistencia de Imágenes**: Almacenar y renderizar imágenes localmente de manera eficiente requirió optimización (uso de `react-image-file-resizer`).

### Posibles Mejoras Futuras
*   **Sincronización en Tiempo Real**: Implementar WebSockets para notificaciones instantáneas entre cocina y caja cuando hay internet.
*   **Analytics Avanzado**: Dashboards más complejos procesados en el cliente con los datos locales.
