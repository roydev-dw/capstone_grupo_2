# 🎨 Diseño de Interfaz y Experiencia de Usuario (UX/UI)

El diseño de FoodTruckApp prioriza la usabilidad en entornos de alta presión y movilidad.

## 🖌️ Identidad Visual

### Paleta de Colores
Los colores fueron seleccionados para evocar calidez y apetito, manteniendo un contraste alto para legibilidad al aire libre.

| Variable CSS | Color Hex | Uso Principal |
| :--- | :--- | :--- |
| `--color-primario` | `#c1904d` (Caramelo) | Botones principales, acentos de marca. |
| `--color-secundario` | `#7b8c5b` (Verde Oliva) | Acciones positivas, confirmaciones. |
| `--color-fondo` | `#faf9f6` (Blanco Hueso) | Fondo general, reduce fatiga visual. |
| `--color-elemento` | `#ffffff` (Blanco Puro) | Tarjetas de productos, contenedores. |
| `--color-info` | `#4b6584` (Azul Gris) | Botones de edición, información neutral. |
| `--color-peligro` | `#a45c5c` (Rojo Terracota) | Eliminar, cancelar, alertas críticas. |
| `--color-texto` | `#333333` (Gris Oscuro) | Texto principal para máxima legibilidad. |

### Tipografía
*   **Títulos y Logos**: `Luckiest Guy` - Una fuente display divertida y audaz, ideal para la marca de un Food Truck.
*   **Cuerpo y UI**: `Poppins` - Sans-serif geométrica, limpia y altamente legible en tamaños pequeños.

---

## 📱 Principios de Diseño UX

### 1. "Touch-First"
Considerando que el sistema se usará en tablets o pantallas táctiles:
*   **Botones Grandes**: Áreas de contacto ampliadas (min 44px) para evitar errores al pulsar.
*   **Espaciado Generoso**: Márgenes amplios entre elementos interactivos.

### 2. Feedback Inmediato
*   **Micro-interacciones**: Animaciones sutiles al presionar botones.
*   **Toast Notifications**: Uso de `react-hot-toast` para confirmar acciones (e.g., "Producto agregado", "Guardado exitoso") sin bloquear la pantalla.

### 3. Accesibilidad y Claridad
*   **Contraste**: Textos oscuros sobre fondos claros.
*   **Iconografía**: Uso de `react-icons` para reforzar visualmente las acciones (e.g., icono de basura para eliminar).

---

## 🧩 Componentes Principales

El desarrollo sigue una metodología basada en componentes reutilizables para mantener la consistencia.

*   **Layouts**: Estructuras base para `RutaProtegida` y `RutaPublica`.
*   **Tarjetas de Producto**: Componente visual que muestra imagen, nombre y precio.
*   **Modales**: Ventanas emergentes para confirmaciones o formularios rápidos (e.g., agregar modificadores).
*   **Botones**: Variantes estandarizadas (Primario, Secundario, Peligro) definidas en clases de utilidad de Tailwind.
