# MeetYouLive - Modern UI Components

## 🎨 Componentes Implementados (Mejorados)

Este documento describe los componentes modernos basados en los diseños de Tinder, TikTok e Instagram, con todas las mejoras implementadas.

### 1. **SwipeCard & SwipeActions** ⭐ MEJORADO
Tarjetas de perfil estilo Tinder con 5 botones de acción.

#### Uso:
```jsx
import SwipeCard from "@/components/SwipeCard";
import SwipeActions from "@/components/SwipeActions";

// En tu componente
<SwipeCard
  profile={{
    _id: "123",
    name: "María García",
    age: 25,
    location: "Madrid",
    distance: 2.5,
    photos: ["url1", "url2", "url3"], // ⭐ NUEVO: Múltiples fotos
    interests: ["Música", "Viajes", "Yoga"], // ⭐ NUEVO: Tags de intereses
    isVerified: true, // ⭐ NUEVO: Badge verificado
    isOnline: true, // ⭐ NUEVO: Estado online
    lastSeen: "2024-01-15T10:30:00Z"
  }}
  onSwipe={(profileId, direction) => {
    // direction: 'left' o 'right'
  }}
  zIndex={2}
/>

<SwipeActions
  onRewind={() => {/* deshacer último swipe */}}
  onPass={() => {/* rechazar perfil */}}
  onStar={() => {/* super like */}}
  onLike={() => {/* dar like */}}
  onBoost={() => {/* boost perfil */}}
  canRewind={true}
  superLikesLeft={5} // ⭐ NUEVO: Contador de Super Likes
  boostsLeft={3} // ⭐ NUEVO: Contador de Boosts
/>
```

#### Características:
- ✅ Drag & drop con animaciones suaves (Framer Motion)
- ✅ Overlays visuales (verde para like, rojo para pass)
- ✅ 5 botones: Rewind (↺), Pass (✗), Star (⭐), Like (💚), Boost (⚡)
- ✅ Sistema de rewind para deshacer swipes
- ✅ Animaciones de pulsación en botones
- ⭐ **NUEVO:** Soporte multi-foto con indicadores de progreso
- ⭐ **NUEVO:** Badge de estado online/activo recientemente
- ⭐ **NUEVO:** Badge de verificación visible con glow cyan
- ⭐ **NUEVO:** Tags de intereses/hobbies (máximo 3 visibles + contador)
- ⭐ **NUEVO:** Feedback háptico (vibración) en mobile
- ⭐ **NUEVO:** Tooltips informativos en SwipeActions
- ⭐ **NUEVO:** Contadores de acciones premium con badges
- ⭐ **NUEVO:** Navegación de fotos: tap izquierda/derecha para cambiar

---

### 2. **StoriesBar**
Stories circulares estilo Instagram en la parte superior del feed.

#### Uso:
```jsx
import StoriesBar from "@/components/StoriesBar";

<StoriesBar 
  stories={[
    {
      _id: "story1",
      userId: "user123",
      user: { name: "John", avatar: "..." },
      isLive: true,
      hasUnseenStory: true,
    }
  ]} 
/>
```

#### Características:
- ✅ Scroll horizontal con Swiper.js
- ✅ Gradiente animado para stories no vistos
- ✅ Badge "LIVE" para streams en vivo
- ✅ Indicador visual de stories ya vistos
- ✅ Avatares circulares con borde de gradiente

---

### 3. **OnboardingCarousel** ⭐ MEJORADO
Carousel de bienvenida con 4 pantallas personalizadas.

#### Uso:
```jsx
import OnboardingCarousel from "@/components/OnboardingCarousel";

<OnboardingCarousel 
  onComplete={() => {
    // Usuario completó onboarding
  }}
/>
```

#### Características:
- ✅ 4 pantallas personalizadas por rol de usuario
- ✅ Efecto de cards 3D con Swiper
- ✅ Gradientes vibrantes personalizados por slide
- ✅ Animaciones con Framer Motion
- ✅ LocalStorage para mostrar solo una vez
- ✅ Botón de skip y close
- ⭐ **NUEVO:** Contenido diferente para creadores vs usuarios normales
- ⭐ **NUEVO:** Copy completamente en español
- ⭐ **NUEVO:** Opción "Mostrar Después" (espera 24h)
- ⭐ **NUEVO:** Slides para usuarios: Descubre Personas, Mira en Vivo, Envía Regalos, Haz Matches
- ⭐ **NUEVO:** Slides para creadores: Bienvenido Creador, Transmite en Vivo, Recibe Regalos, Retira Ganancias
- ⭐ **NUEVO:** Iconos específicos por rol y mejores descripciones

---

### 4. **BottomNavEnhanced** ⭐ MEJORADO
Navegación inferior mejorada con botón central "+" para crear contenido.

#### Uso:
```jsx
import BottomNavEnhanced from "@/components/BottomNavEnhanced";

// En layout.jsx
<BottomNavEnhanced />
```

#### Características:
- ✅ 5 tabs: Home, Explore, Create (+), Inbox, Profile
- ✅ Botón central elevado con gradiente
- ✅ Menú desplegable: Go Live, Upload Video, Add Story
- ✅ Indicador visual de tab activo (barra superior)
- ✅ Animaciones de rotación en botón "+"
- ✅ Backdrop blur para el menú
- ⭐ **NUEVO:** Badge de notificaciones no leídas en Inbox
- ⭐ **NUEVO:** Badge de matches nuevos en Home
- ⭐ **NUEVO:** Polling automático cada 30s para actualizar contadores
- ⭐ **NUEVO:** Animación especial cuando hay nuevo match
- ⭐ **NUEVO:** ARIA labels para accesibilidad
- ⭐ **NUEVO:** Animación pulse en badge de Inbox
- ⭐ **NUEVO:** Contadores muestran "99+" cuando superan 99

---

### 5. **ProfileHeader & ProfilePhotoGrid**
Cabecera de perfil moderna con estadísticas y grid de fotos.

#### Uso:
```jsx
import ProfileHeader from "@/components/ProfileHeader";
import ProfilePhotoGrid from "@/components/ProfilePhotoGrid";

<ProfileHeader 
  user={userData}
  isOwnProfile={true}
/>

<ProfilePhotoGrid 
  photos={["url1", "url2", ...]}
  videos={[
    { _id: "v1", url: "...", thumbnail: "..." }
  ]}
/>
```

#### Características:
- ✅ Cover con gradiente
- ✅ Avatar grande con badge de verificación
- ✅ Indicador "LIVE" si está transmitiendo
- ✅ 4 estadísticas: Followers, Following, Posts, Likes
- ✅ 3 tabs: Feed, Info, Reels
- ✅ Botón "Message" prominente
- ✅ Grid responsive de fotos/videos (3 columnas)
- ✅ Indicador de play en videos

---

### 6. **VerticalVideoFeed**
Feed vertical de videos estilo TikTok.

#### Uso:
```jsx
import VerticalVideoFeed from "@/components/VerticalVideoFeed";

<VerticalVideoFeed 
  videos={[
    {
      _id: "v1",
      url: "video.mp4",
      creator: { _id: "u1", name: "John", ... },
      description: "Amazing video!",
      hashtags: ["trend", "viral"],
      likesCount: 1234,
      commentsCount: 56,
    }
  ]}
/>
```

#### Características:
- ✅ Swipe vertical para cambiar videos (touch gestures)
- ✅ Video en pantalla completa con autoplay
- ✅ Barra lateral de acciones: Like, Comment, Gift, Share
- ✅ Avatar del creador con botón Follow integrado
- ✅ Progress dots indicando posición en el feed
- ✅ Sheet de comentarios deslizable
- ✅ Overlay de play/pause
- ✅ Info del creador y descripción en la parte inferior

---

### 7. **TrendingFeed**
Feed de contenido trending/viral estilo Instagram.

#### Uso:
```jsx
import TrendingFeed from "@/components/TrendingFeed";

<TrendingFeed 
  posts={[
    {
      _id: "p1",
      type: "photo", // o "video"
      image: "url",
      thumbnail: "url", // para videos
      creator: { ... },
      description: "...",
      isTrending: true,
      likesCount: 5678,
      commentsCount: 234,
      viewsCount: 12345,
      createdAt: "2024-01-01T00:00:00Z",
    }
  ]}
/>
```

#### Características:
- ✅ Título "🔥 Trendy" con animación de fuego
- ✅ Badge "🔥 TRENDING" animado en posts
- ✅ Grid responsive (1/2/3 columnas según pantalla)
- ✅ Avatar del creador con verificación
- ✅ Stats: likes, comments, views
- ✅ Timestamp relativo ("2h ago")
- ✅ Indicador de play en videos
- ✅ Hover effects

---

## 🎨 Sistema de Colores

El tema oscuro usa estos colores principales:

```css
--bg: #0f0821 (fondo principal)
--accent: #e040fb (rosa neón)
--accent-2: #e040fb (rosa neón 2)
--accent-3: #7c3aed (púrpura)

Gradientes:
--grad-primary: linear-gradient(135deg, #c040ff 0%, #ff4fa3 100%)
--grad-cool: linear-gradient(135deg, #7c3aed 0%, #22d3ee 100%)
```

---

## 📱 Feed Principal Mejorado (page-v2.jsx)

Nueva versión del feed con todas las mejoras integradas:

```jsx
import ModernFeedPageV2 from "@/app/feed/page-v2";
```

### Incluye:
1. **StoriesBar** en la parte superior
2. **Live streams** en scroll horizontal
3. **Swipe cards** con acciones modernas
4. **Creadores destacados** en grid
5. Integración completa con backend

---

## 🚀 Cómo Integrar

### Opción 1: Reemplazar componentes existentes
```bash
# Renombrar página actual
mv frontend/app/feed/page.jsx frontend/app/feed/page.old.jsx

# Usar nueva versión
mv frontend/app/feed/page-v2.jsx frontend/app/feed/page.jsx
```

### Opción 2: Usar BottomNavEnhanced
```jsx
// En layout.jsx, reemplazar:
import BottomNavWrapper from "../components/BottomNavWrapper";

// Por:
import BottomNavEnhanced from "../components/BottomNavEnhanced";

// Y en el JSX:
<BottomNavEnhanced />
```

### Opción 3: Agregar Onboarding
```jsx
// En cualquier página después del login
import OnboardingCarousel from "@/components/OnboardingCarousel";

function MyPage() {
  return (
    <>
      <OnboardingCarousel onComplete={() => console.log("Done!")} />
      {/* resto del contenido */}
    </>
  );
}
```

---

## 📦 Dependencias Instaladas

```json
{
  "framer-motion": "^latest",
  "swiper": "^latest"
}
```

Estas están instaladas y listas para usar.

---

## 🎬 Animaciones

Todos los componentes usan **Framer Motion** para animaciones suaves:

- **Swipe**: Animaciones de drag con spring physics
- **Stories**: Pulse animation en stories no vistos
- **Onboarding**: Stagger animations en elementos
- **Bottom Nav**: Rotate animation en botón "+"
- **Videos**: Fade in/out en cambio de videos
- **Trending**: Scale on hover

---

## 🔥 Mejores Prácticas

1. **Performance**: Los componentes usan `React.memo` donde es apropiado
2. **Accessibility**: Todos los botones tienen áreas de toque de 44x44px mínimo
3. **Responsive**: Todos los componentes funcionan en móvil, tablet y desktop
4. **Dark Theme**: Consistente en toda la aplicación
5. **Loading States**: Incluidos en todos los componentes

---

## 🐛 Testing

```bash
# Build para verificar que no hay errores
cd frontend && npm run build

# Desarrollo
npm run dev
```

---

## 📝 Notas Importantes

1. **SwipeCard** requiere datos de usuario con: `_id`, `name`, `avatar`, `age`, `location`
2. **StoriesBar** puede recibir tanto lives activos como stories normales
3. **VerticalVideoFeed** es un componente de pantalla completa (position: fixed)
4. **OnboardingCarousel** usa localStorage con key `"hasSeenOnboarding"`
5. **BottomNavEnhanced** requiere session para verificar si puede ir live

---

## 🎯 Próximos Pasos Sugeridos

1. Conectar los componentes con las APIs reales del backend
2. Agregar tests unitarios con Jest/RTL
3. Implementar analytics para tracking de interacciones
4. Agregar más animaciones micro-interactions
5. Optimizar lazy loading de imágenes
6. Implementar virtual scrolling para feeds largos

---

## 💡 Tips de Uso

- Usa `SwipeActions` dentro de un contenedor con altura fija
- `StoriesBar` se adapta automáticamente al ancho del contenedor
- `VerticalVideoFeed` debe usarse en rutas dedicadas (ej: `/reels`)
- `TrendingFeed` funciona mejor con al menos 6 posts
- `OnboardingCarousel` se muestra automáticamente solo la primera vez

---

Hecho con ❤️ para MeetYouLive
