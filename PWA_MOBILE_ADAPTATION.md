# PWA y Adaptación Móvil Completa - MeetYouLive

## Resumen

MeetYouLive ahora está completamente adaptado para funcionar como aplicación web progresiva (PWA) y ofrece una experiencia móvil optimizada. Los usuarios pueden instalar la aplicación en sus dispositivos y usarla offline con funcionalidad limitada.

## Características Implementadas

### 1. Progressive Web App (PWA) ✅

#### Viewport Configuration
- **Archivo**: `frontend/app/layout.jsx`
- **Cambios**: Agregado `export const viewport` con configuración óptima
  - `width: device-width` - Ancho adaptativo
  - `initialScale: 1` - Escala inicial correcta
  - `maximumScale: 5` - Permite zoom hasta 5x
  - `themeColor: #0f0821` - Color de tema de la app

#### Service Worker
- **Archivo**: `frontend/public/sw.js`
- **Mejoras**:
  - Cache name actualizado a `meetyoulive-v3`
  - Estrategia Network-first para APIs con fallback offline
  - Estrategia Cache-first para assets estáticos (imágenes, fuentes)
  - Cache de endpoints críticos: `/api/user/me`, `/api/notifications`, `/api/chats`
  - Respuestas JSON offline para APIs
  - Manejo de errores robusto

#### Registro de Service Worker
- **Archivo**: `frontend/components/ServiceWorkerRegistration.jsx`
- **Funcionalidad**:
  - Registra automáticamente el service worker al cargar la app
  - Espera a que la página cargue completamente (no bloquea el render inicial)
  - Verifica actualizaciones cada hora
  - Notifica cuando hay una nueva versión disponible

#### Indicador de Conexión
- **Archivo**: `frontend/components/OfflineIndicator.jsx`
- **Funcionalidad**:
  - Banner rojo cuando se pierde la conexión
  - Banner verde cuando se restaura la conexión (desaparece en 3s)
  - Mensajes en español: "Sin conexión a internet" / "Conexión restablecida"
  - Animación de entrada suave

#### Página Offline
- **Archivo**: `frontend/app/offline/page.jsx`
- **Funcionalidad**:
  - Se muestra cuando el usuario intenta navegar sin conexión
  - Diseño limpio con emoji 📡
  - Botón "Reintentar" para recargar cuando haya conexión
  - Estilos inline para asegurar que siempre se renderice

#### Manifest Mejorado
- **Archivos**: `frontend/public/manifest.json` y `site.webmanifest`
- **Mejoras**:
  - Nombre completo: "MeetYouLive - Conecta en vivo"
  - Descripción mejorada en español
  - `orientation: portrait-primary` - Orientación vertical preferida
  - `categories: ["social", "entertainment", "lifestyle"]`
  - `lang: "es"` - Idioma español
  - Iconos con `purpose: "any"` y `purpose: "maskable"`
  - Shortcuts a páginas principales (Feed, Chats, Notificaciones, Perfil) en manifest.json

#### Prompt de Instalación
- **Archivo**: `frontend/components/InstallPrompt.jsx` (ya existía)
- **Integrado en**: `frontend/app/layout.jsx`
- Banner sticky en la parte superior cuando el navegador permite instalación
- Botón "Instalar" y botón para cerrar
- Logo de la app incluido en el banner

### 2. Responsividad Móvil Completa ✅

#### CSS Mobile-First
- **Archivo**: `frontend/app/globals.css` (añadidos ~300 líneas)
- **Mejoras principales**:

##### Safe Area Insets (iPhone X+)
```css
body {
  padding-bottom: env(safe-area-inset-bottom);
}
.main-content {
  min-height: calc(100vh - env(safe-area-inset-bottom));
}
```
- Soporte para notch y barra home de iOS
- Padding adaptativo en la parte inferior

##### Touch Targets
```css
button, .btn, a.btn {
  min-height: 44px;
  min-width: 44px;
}
```
- Mínimo de 44px según guías de Apple
- Facilita tocar botones en móviles

##### Prevención de Zoom en Inputs (iOS)
```css
input, textarea, select {
  font-size: 16px;
}
```
- iOS no hace zoom automático si el font-size es ≥16px

##### Breakpoints Responsivos
- **Mobile**: `max-width: 768px`
  - Padding reducido: `1rem`
  - Layouts de 1 columna
  - Títulos más pequeños
  - Botones de formulario apilados (width: 100%)
  
- **Landscape Mobile**: `max-width: 900px and orientation: landscape`
  - Padding vertical reducido
  - Optimizado para visualización horizontal
  
- **Tablet**: `769px - 1024px`
  - Layouts de 2 columnas
  - Padding intermedio

##### Display Mode: Standalone
```css
@media (display-mode: standalone) {
  .browser-only {
    display: none !important;
  }
}
```
- Detecta cuando la app está instalada como PWA
- Oculta elementos específicos del navegador

##### Touch Actions
```css
button, .btn, a {
  -webkit-tap-highlight-color: rgba(224, 64, 251, 0.3);
  touch-action: manipulation;
}
```
- Highlight color personalizado al tocar
- `touch-action: manipulation` previene double-tap zoom

##### Overscroll Behavior
```css
body {
  overscroll-behavior-y: contain;
}
```
- Previene pull-to-refresh en algunos navegadores móviles

##### Smooth Scrolling
- Habilitado en navegadores que soportan `prefers-reduced-motion: no-preference`

##### Accesibilidad
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
- Respeta preferencias de accesibilidad del usuario

##### Tipografía Móvil
- h1: `1.75rem` en móvil (vs 2rem en desktop)
- h2: `1.5rem` en móvil
- h3: `1.25rem` en móvil
- line-height optimizado para lectura en pantallas pequeñas

##### Optimizaciones de Video
```css
@media (max-width: 768px) {
  video {
    max-height: 70vh;
  }
}
```
- Limita altura del video en móviles

### 3. Integración en Layout Principal

**Archivo**: `frontend/app/layout.jsx`

Componentes agregados en orden:
1. `<ServiceWorkerRegistration />` - Registra SW silenciosamente
2. `<OfflineIndicator />` - Muestra estado de conexión
3. `<InstallPrompt />` - Banner de instalación
4. `<NavbarWrapper />`
5. `<main>` con contenido
6. `<BottomNavWrapper />`
7. `<IncomingCallNotification />`
8. `<FloatingGoLiveButton />`

## Cómo Instalar la App (Para Usuarios)

### Android (Chrome/Edge)
1. Abrir https://meetyoulive.net en Chrome
2. Aparecerá un banner "Instalar MeetYouLive" o hacer clic en ⋮ → "Instalar aplicación"
3. Seguir las instrucciones
4. La app aparecerá en el cajón de aplicaciones

### iOS (Safari)
1. Abrir https://meetyoulive.net en Safari
2. Tocar el botón Compartir (cuadrado con flecha hacia arriba)
3. Desplazarse y tocar "Añadir a pantalla de inicio"
4. Confirmar
5. La app aparecerá en la pantalla de inicio

### Desktop (Chrome/Edge)
1. Abrir https://meetyoulive.net
2. Buscar el ícono de instalación (⊕) en la barra de direcciones
3. Hacer clic en "Instalar"
4. La app se abrirá en su propia ventana

## Funcionalidad Offline

### Qué Funciona Offline ✅
- Visualización de páginas visitadas previamente
- Lectura de notificaciones cargadas previamente
- Visualización del perfil del usuario (datos en cache)
- Navegación entre páginas estáticas
- Visualización de chats cargados previamente (solo lectura)

### Qué NO Funciona Offline ❌
- Envío de mensajes
- Visualización de lives en tiempo real
- Carga de nuevas notificaciones
- Actualización del perfil
- Compra de monedas
- Cualquier acción que requiera comunicación con el servidor

### Comportamiento Offline
- Las peticiones API fallan graciosamente con mensaje: `{ error: "Sin conexión", offline: true }`
- El componente `OfflineIndicator` muestra un banner rojo en la parte superior
- Los usuarios pueden ver contenido cacheado pero no pueden realizar acciones

## Testing

### Verificar PWA
1. Abrir Chrome DevTools → Application → Manifest
   - Verificar que el manifest se carga correctamente
2. Application → Service Workers
   - Verificar que `sw.js` está registrado y activo
3. Application → Cache Storage
   - Verificar que `meetyoulive-v3` contiene assets

### Simular Offline
1. Chrome DevTools → Network → Offline
2. Intentar navegar por la app
3. Verificar que:
   - Aparece el banner rojo "Sin conexión"
   - Las páginas cacheadas se cargan
   - Las APIs devuelven respuestas offline

### Lighthouse PWA Audit
```bash
# Correr en producción
npm run build
npm start

# En otra terminal
npx lighthouse https://localhost:3000 --view
```

Métricas esperadas:
- PWA: 100/100
- Performance: >90
- Accessibility: >90
- Best Practices: 100
- SEO: 100

## Build y Deploy

### Build Local
```bash
cd frontend
npm install
npm run build
```

### Build para Capacitor (Móvil Nativo)
```bash
cd frontend
npm run build:mobile  # Genera static export en out/
npx cap sync          # Sincroniza con proyectos iOS/Android
npx cap open android  # Abre Android Studio
npx cap open ios      # Abre Xcode
```

### Deploy en Vercel
```bash
# Vercel hace build automático con:
# npm run build

# Asegurarse de configurar variables de entorno:
NEXT_PUBLIC_API_URL=https://meetyoulive-api.onrender.com
# + todas las demás variables
```

## Compatibilidad

### Navegadores Soportados
- ✅ Chrome 90+ (Android, Desktop)
- ✅ Edge 90+ (Desktop)
- ✅ Safari 14+ (iOS, macOS)
- ✅ Firefox 88+ (Android, Desktop)
- ⚠️ Safari iOS tiene limitaciones en PWA (sin push notifications, sin instalación automática)

### Capacitor (Apps Nativas)
- ✅ Android 6.0+ (API 23+)
- ✅ iOS 13.0+

## Próximos Pasos (Opcional)

### Mejoras Futuras
1. **Sync en Background**: Enviar mensajes offline cuando se recupere conexión
2. **Push Notifications en iOS**: Requiere app nativa con Capacitor
3. **App Shortcuts Dinámicos**: Mostrar chats recientes en el menú contextual
4. **Badging API**: Mostrar contador de notificaciones en el ícono de la app
5. **Share Target API**: Permitir compartir contenido desde otras apps
6. **File System Access**: Guardar fotos/videos localmente
7. **Web Share API**: Compartir perfiles/lives desde la app

## Recursos

- [PWA Checklist](https://web.dev/pwa-checklist/)
- [Next.js PWA Best Practices](https://nextjs.org/docs/advanced-features/progressive-web-apps)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Capacitor Documentation](https://capacitorjs.com/docs)

## Soporte

Si encuentras problemas con PWA o mobile:
1. Borrar cache del navegador
2. Desinstalar y reinstalar la app
3. Verificar que Service Worker está actualizado (DevTools → Application → Service Workers → Update)
4. Revisar logs en consola del navegador

---

**Implementado por**: GitHub Copilot
**Fecha**: Mayo 2026
**Versión**: v3.0 (Service Worker Cache Name)
