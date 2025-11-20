# 💻 Guía Técnica y de Desarrollo

## 🏗️ Arquitectura del Proyecto

La estructura de carpetas sigue una organización modular basada en funcionalidades y capas de abstracción.

```
src/
├── assets/         # Imágenes y recursos estáticos
├── components/     # Componentes reutilizables (Botones, Modales, Cards)
├── hooks/          # Custom Hooks (Lógica de estado reutilizable)
├── pages/          # Vistas principales (Rutas)
│   ├── Administrador.jsx
│   ├── Vendedor.jsx
│   └── ...
├── routes/         # Configuración de rutas y protección
│   ├── RutaProtegida.jsx
│   └── ...
├── styles/         # Archivos CSS adicionales
├── utils/          # Lógica de negocio y acceso a datos
│   ├── api.js      # Comunicación con Backend
│   ├── db.js       # Configuración de Dexie
│   ├── repo*.js    # Repositorios de datos
│   └── syncManager.js
├── App.jsx         # Componente raíz
└── main.jsx        # Punto de entrada
```

## 📐 Patrones de Diseño

### Repository Pattern
Para desacoplar la vista de la base de datos, utilizamos el patrón Repositorio en `src/utils/`.
*   **Objetivo**: Que los componentes no llamen directamente a `db.table('productos').add(...)`.
*   **Implementación**: `repoProductos.js` expone funciones como `crearProducto(data)` o `obtenerProductos()`. Esto permite cambiar la implementación de persistencia (e.g., de Dexie a LocalStorage o API directa) sin tocar los componentes de React.

### Custom Hooks
Encapsulamos lógica compleja en hooks para mantener los componentes limpios.
*   Ejemplo: `useCurrentUser` para obtener el usuario autenticado en cualquier parte de la app.

---

## 📡 API y Comunicación

El archivo `src/utils/api.js` centraliza las llamadas HTTP al servidor backend.
*   **Axios/Fetch**: Se utiliza para enviar datos sincronizados.
*   **Manejo de Errores**: Interceptores para gestionar tokens expirados o errores de red.

---

## 🛠️ Guía de Desarrollo

### Requisitos Previos
*   Node.js (v18 o superior recomendado)
*   NPM o Bun

### Instalación
```bash
# Clonar el repositorio
git clone <url-repo>

# Instalar dependencias
npm install
```

### Scripts Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo con HMR. |
| `npm run build` | Compila la aplicación para producción. |
| `npm run preview` | Vista previa local del build de producción. |
| `npm run lint` | Ejecuta ESLint para verificar calidad de código. |
| `npm run docs` | Genera documentación JSDoc en la carpeta `docs/`. |

### Despliegue
El proyecto es una SPA (Single Page Application). El comando `npm run build` genera una carpeta `dist/` con archivos estáticos listos para ser servidos por Nginx, Vercel, Netlify, etc.
