# TrackView

Tablero Kanban interactivo construido con Next.js, React, TypeScript y Tailwind CSS. El código separa dominio, casos de uso, infraestructura y presentación.

## Funcionalidades

- Búsqueda de tareas por título, descripción, persona o etiqueta.
- Filtro por prioridad, orden por fecha/prioridad/título y agrupación visual.
- Creación de columnas y tareas.
- Movimiento por drag-and-drop, destacado y eliminación de tareas.
- Edición de la descripción y visibilidad del proyecto.
- Progreso recalculado al mover o crear tareas.
- Persistencia local de los cambios en el navegador.
- Navegación lateral colapsable y diálogos informativos accesibles.

## Ejecución

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Los cambios del tablero se guardan en `localStorage`; no se necesita una base de datos para ejecutar la demostración.

## Comprobaciones

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Conexión con Supabase

El modo predeterminado sigue siendo `memory`. Para usar Supabase:

1. Crea un proyecto en Supabase.
2. Ejecuta [la migración](supabase/migrations/202609280001_initial_schema.sql) en el SQL Editor o con `supabase db push`.
3. Ejecuta [el seed](supabase/seed.sql) (`supabase db query --linked -f supabase/seed.sql`). Solo crea el workspace, el proyecto y 4 estados vacíos; no agrega personas ni tareas de prueba.
4. Copia `.env.example` a `.env.local`, agrega la URL y la publishable key del proyecto, y cambia `NEXT_PUBLIC_DATA_PROVIDER=supabase`.
5. Configura Supabase Auth. Tras iniciar sesión por primera vez, la primera persona que inicia sesión con Google queda como dueña del workspace automáticamente.

La aplicación incluye clientes separados para navegador y servidor, refresco seguro de sesión en `proxy.ts`, un repositorio Supabase, un endpoint `GET/PUT /api/projects/[projectId]`, guardado con debounce y políticas RLS. Sin credenciales continúa funcionando localmente.

La migración `202609280002_google_profiles.sql` añade correo y avatar al perfil. Después de actualizar el código, aplica las migraciones pendientes con `npx supabase@latest db push`.

### Google OAuth

La pantalla `/login` permite autenticación por correo y Google. Google debe configurarse como proveedor en Supabase y usar `/auth/callback` como redirect permitido de la aplicación. El callback PKCE intercambia el código por una sesión y asocia al usuario con el workspace automáticamente.
