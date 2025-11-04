# Registro de Cambios

Todos los cambios notables de la extensión "json-cleaner" serán documentados en este archivo.

## [1.0.1] - 2025-11-04

### Mejorado
- � Panel de vista previa adaptado a los temas de VS Code
- 🚀 Eliminadas dependencias externas (Bootstrap y Highlight.js)
- 🎯 Colorización de sintaxis JSON usando variables CSS nativas de VS Code
- ✨ Los colores se adaptan automáticamente al cambiar el tema
- 🖌️ Fondo transparente del código para mejor integración visual

### Técnico
- Implementación de resaltado de sintaxis JSON personalizado
- Uso de variables CSS de VS Code (--vscode-*)
- Mejor rendimiento sin librerías externas

## [1.0.0] - 2025-11-03

### Agregado
- 🎉 Lanzamiento inicial de JSON Cleaner
- ✅ Vista de árbol interactiva para visualización de estructura JSON
- 👁️ Panel de vista previa con actualizaciones en tiempo real
- 📋 Copiar JSON filtrado al portapapeles
- 📄 Crear nuevo archivo con contenido filtrado
- 🔄 Auto-actualización en cambios de archivos JSON (debounce de 500ms)
- 💾 Preservación de estado al cambiar entre archivos
- 🎯 Funciones de filtrado inteligente:
  - Selección con checkboxes para propiedades
  - Soporte para objetos anidados
  - Soporte para arrays de objetos
  - Soporte para arrays de primitivos (selección directa)
  - Eliminación automática de objetos vacíos en arrays
- 🎨 Botón para alternar vista previa en la barra del editor y vista de árbol
- 🌐 Soporte multi-documento con caché de estado

### Características
- Vista de árbol muestra estructura JSON con nodos expandibles
- Arrays de primitivos muestran valores directamente (sin índices numéricos)
- Arrays de objetos muestran índices numéricos para cada elemento
- Panel de vista previa se actualiza automáticamente cuando cambian las selecciones
- El estado se preserva al cambiar entre archivos JSON
- JSON inválido no rompe el árbol (muestra el estado válido anterior)

### Técnico
- Implementación en TypeScript con compilación estricta
- Patrón Singleton para el proveedor de datos del árbol
- Clonación profunda para preservación de estado
- Identificación de nodos basada en UUID