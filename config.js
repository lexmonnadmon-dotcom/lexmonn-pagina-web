// ============================================================
// CONFIGURACIÓN DE LA TIENDA LEXMONN
// Edita SOLO los valores de aquí abajo, no toques el resto del sitio.
// ============================================================

const CONFIG = {
  // URL CSV publicada de la Google Sheet de productos.
  // Ver INSTRUCCIONES.md -> "Paso 2: Publicar la hoja" para saber cómo obtenerla.
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/1LvhvUi1HuuiVRemWgHFzFRTqGyCuRCZ-MY81zp9jyn0/gviz/tq?tqx=out:csv",

  // Número de WhatsApp donde llegarán los pedidos.
  // Formato internacional, SOLO números, sin +, espacios ni guiones.
  // Ejemplo Colombia: 57 + número celular -> "573015597873"
  WHATSAPP_NUMBER: "573015597873",

  // Nombre y datos que se muestran en el encabezado del sitio
  STORE_NAME: "Lexmonn",
  STORE_TAGLINE: "Porta herramientas fabricados en Colombia, hechos para durar",
  STORE_LOCATION: "Cll 54 cr 53-34, Bello, Antioquia",
};

// No toques esto: permite que build.js (el generador de páginas) lea esta
// misma configuración desde Node. No cambia nada de lo de arriba.
if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
}
