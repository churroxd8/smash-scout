# Architecture - Smash Scout

Documento técnico de arquitectura para **Smash Scout**: un SaaS de competitive intelligence para Super Smash Bros. Ultimate, construido sobre la API pública de start.gg.

Este documento captura las decisiones de diseño, el modelo de datos, los flujos principales, y la justificación de cada elección técnica. Sirve como referencia durante la construcción del proyecto y como mantenimiento para entrevistas técnicas.

---

## 1. Resumen del producto

**Problema**: los jugadores competitivos de Smash Ultimate tienen su historial disperso en start.gg con UX limitada y cero analytics agregado. No pueden responder fácilmente preguntas como "¿estoy mejorando?", "¿contra quién debo ganar para subir?", o "¿quién es este jugador al que enfrento mañana?".

**Solución**: un SaaS que agrega y analiza el historial competitivo desde la API pública de start.gg, presentando insights visuales que start.gg nativo no ofrece.

**Usuario objetivo**: jugador competitivo amateur-a-mid de Smash Ultimate que asiste a locales y regionales con regularidad.

**Feature estrella**: *Player Dossier* - perfil completo de cualquier jugador con trayectoria, matchups head-to-head, y tendencias regionales.

**Hook de adquisición**: *Smash Wrapped* - resumen anual estilo Spotify Wrapped con cards compatibles.

---

## 2. Alcance del MVP

### Dentro del MVP

- Autenticación vía OAuth con start.gg.
- Player Dossier del usuario logueado (timeline de torneos, stats, progresión).
- Detalle de torneo con sets del usuario.
- Matchup analysis con disclaimer de coverage.
- Búsqueda y scouteo de otros jugadores por URL de perfil.
- Head-to-head entre dos jugadores cualesquiera.
- Smash Wrapped bajo demanda.
- Ingesta asíncrona con estado observable.

### Fuera del MVP (roadmap post-MVP)

- Character-level analytics (depende de mejor coverage).
- Notificaciones (ej. "tu rival frecuente acaba de registrar un torneo").
- Features para TOs (tournament organizers).
- Soporte para Melee, Rivals of Aether 2, u otros juegos.
- Predicción de brackets con ML.
- App móvil nativa.
- Stage-level analytics.

---

## 3. Principios arquitectónicos

Decisiones transversales que informan todo el diseño.

### 3.1 Separación estricta de paths

**Path síncrono (UI <-> DB propia)**: toda interacción del usuario con la aplicación web responde leyendo o escribiendo únicamente contra la base de datos propia. Latencia objetivo <100ms p95. Nunca toca start.gg.

**Path asíncrono (Worker<->start.gg)**: toda comunicación con start.gg vive en un worker separado, disparado por acciones explícitas del usuario (login, refresh, scouteo) o schedulers automáticos. Respeta rate limits y corre bajo su propio ritmo.

**Regla de oro**: el path crítico del usuario nunca espera a start.gg. La UI siempre responde con lo que hay en DB, aunque sea un estado "processing" con progreso.

### 3.2 Base de datos propia como fuente de verdad para consultas

start.gg es la fuente de datos (ingestión). La DB propia es la fuente de verdad para consultas (UI, cálculos, agregaciones). Esto garantiza:

- Latencia baja para el usuario.
- Independencia de la disponibilidad de start.gg.
- Acumulación de valor histórico con el tiempo (data que ya ingestamos no se pierde aunque start.gg cambie su API).

### 3.3 Ingesta on-demand, no masiva

Dado el rate limit de ~60 req/min y el costo de ingestar eventos grandes completos (~1,600 sets x complexity media), la estrategia es **ingestar solo los datos que un usuario real necesita, disparado por su acción explícita**.

Corolario: la DB crece proporcional al uso, no a la cantidad de torneos en el mundo.

### 3.4 Idempotencia y upserts por clave natural

Toda escritura a la DB derivada de start.gg usa las IDs numéricas de start.gg como claves únicas (`startgg_*_id UNIQUE`). Re-ejecutar el mismo job produce el mismo resultado sin duplicados.

### 3.5 Observabilidad desde el día 1

Cada request a start.gg se loggea con duración, complexity, status. Cada job tiene progreso observable en DB. Los errores se capturan centralmente (Sentry). No son features opcionales; son decisiones arquitectónicas.

---

## 4. Modelo de datos (schema)

PostgreSQL gestionado (Neon). ORM: Drizzle con TypeScript.

### 4.1 Entidades principales

**`users`** - cuenta de Smash Scout. Minoría numérica.

```sql
users (
    id                      UUID PK,
    startgg_user_id         BIGINT UNIQUE NOT NULL,
    startgg_slug            TEXT UNIQUE NOT NULL,
    startgg_access_token    TEXT, -- (cifrado en reposo)
    startgg_refresh_token   TEXT, -- (cifrado en reposo)
    token_expires_at        TIMESTAMPTZ,
    created_at              TIMESTAMPTZ,
    last_refreshed_at       TIMESTAMPTZ,
    last_login_at           TIMESTAMPTZ
)
```

**`players`** - identidades competitivas en start.gg. Mayoría numérica (crece con scouteos).

```sql
players (
    id                      UUID PK,
    startgg_player_id       BIGINT UNIQUE NOT NULL,
    startgg_user_id         BIGINT UNIQUE,
    startgg_user_slug       TEXT,
    gamer_tag               TEXT NOT NULL,
    prefix                  TEXT,
    country_code            TEXT,
    state                   TEXT,
    city                    TEXT,
    avatar_url              TEXT,
    last_seen_at            TIMESTAMPTZ,
    ingested_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL
)
-- Indexes: lower(gamer_tag), start_gg_user_slug
```

Distinción clave: `users` son quienes se logean a Smash Scout: `players` son quienes compiten en start.gg. Un `user` siempre tiene un `player` asociado, pero la mayoría de `players` no son `users`.

**`tournaments`** y **`events`**:

```sql
tournaments (
    id                      UUID PK,
    startgg_tournament_id   BIGINT UNIQUE NOT NULL,
    slug                    TEXT UNIQUE NOT NULL,
    name                    TEXT NOT NULL,
    start_at                TIMESTAMPTZ NOT NULL,
    end_at                  TIMESTAMPTZ,
    city                    TEXT,
    country_code            TEXT,
    is_online               BOOLEAN GENERATED (city IS NULL AND country_code IS NULL) STORED,
    num_attendees           INT,
    created_at              TIMESTAMPTZ NOT NULL
)

events (
    id                      UUID PK,
    startgg_event_id        BIGINT UNIQUE NOT NULL,
    tournament_id           UUID FK,
    name                    TEXT NOT NULL,
    videogame_id            INT NOT NULL,
    num_entrants            INT,
    is_singles              BOOLEAN NOT NULL,
    state                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL
)
```

**`player_standings`** - placement de un player en un event

```sql
player_standings (
    id                      UUID PK,
    player_id               UUID FK,
    event_id                UUID FK,
    placement               INT NOT NULL,
    entrant_id              BIGINT NOT NULL,
    entrant_name            TEXT NOT NULL, -- point-in-time
    startgg_standing_id     BIGINT UNIQUE NOT NULL,
    UNIQUE (player_id, event_id)
)
```

**`sets`** - la entidad más densa. Desnormalizada por eficiencia de queries

```sql
sets (
    id                      UUID PK,
    startgg_set_id          BIGINT NOT NULL,
    event_id                UUID FK,

    entrant1_id             BIGINT NOT NULL,
    entrant1_player_id      UUID FK (nullable), -- null si aún no indexado
    entrant1_name           TEXT NOT NULL,
    entrant1_score          INT,

    entrant2_id             BIGINT NOT NULL,
    entrant2_player_id      UUID FK (nullable),
    entrant2_name           TEXT NOT NULL,
    entrant2_score          INT,

    winner_entrant_id       BIGINT,
    winner_player_id        UUID FK (nullable),

    full_round_text         TEXT,
    round                   INT,
    display_score           TEXT,
    completed_at            TIMESTAMPTZ,
    has_game_data           BOOLEAN NOT NULL DEFAULT false
)
-- Indexes: event_id, entrant1_player_id, entrant2_player_id, completed_at DESC
```

**`games`** - granularidad más fine. Solo existe cuando el TO registró data.

```sql
games (
    id                      UUID PK,
    startgg_game_id         BIGINT UNIQUE NOT NULL,
    set_id                  UUID FK,
    order_num               INT NOT NULL,
    winner_entrant_id       BIGINT,
    stage_id                INT,
    stage_name              TEXT,
    entrant1_character_id   INT,
    entrant2_character_id   INT,
    UNIQUE (set_id, order_num)
)
-- Indexes: set_id, entrant1_character_id, entrant2_character_id
```

**`characters`** - diccionario estático, seed desde `characters.json`.

```sql
characters (
    id                      INT PK,             -- selectionValue de start.gg
    name                    TEXT NOT NULL,
    slug                    TEXT NOT NULL,
    icon_url                TEXT,
    released_at             DATE
)
```

**`ingestion_jobs`** - persistencia de jobs para observabilidad y auditoría.

```sql
ingestion_jobs (
    id                      UUID PK,
    player_id               UUID FK,
    triggered_by_user_id    UUID FK (nullable),
    status                  TEXT NOT NULL, -- PENDING, RUNNING, COMPLETED, FAILED
    progress_current        INT DEFAULT 0,
    progress_total          INT,
    error_message           TEXT,
    started_at              TIMESTAMPTZ,
    finished_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL
)
-- Indexes: player_id, status
```

### 4.2 Decisiones de modelado

**Desnormalización deliberada es `sets`**: en ves de una tabla intermedia `set_participants`, se guardan los dos entrants como columnas fijas. Ultimate es siempre 1v1; la cardinalidad es conocida y fija, lo cual hace que la desnormalización gane claramente. Las queries head-to-head pasan de joins complejos a un `WHERE` con `OR`.

**Desnormalización similar en `games`**: `entrant1_character_id` y `entrant2_character_id` como columnas fijas en lugar de una tabla `game_selections`. Mismo razonamiento.

**`entrant_X_player_id` nullable**: permite lazy indexing. Cuando ingestamos los sets de un usuario, sus oponentes pueden no estar indexados completamente. Guardamos `entrant_X_id` (de start.gg) y `entrant_X_name` siempre; el `entrant_X_player_id` se llena cuando el player existe en nuestra DB. Si alguienhace scouteo del oponente después, se actualiza.

**`has_game_data` como flag**: permite filtrar sets con/sin character data sin hacer joins a `games`. Útil para el indicador de coverage en UI.

**`is_online` como columna generada**: computada automáticamente de `city IS NULL AND country_code IS NULL`. Evita inconsistencia y facilita filtros.

---

## 5. Flujos principales

### 5.1 OAuth + primera ingesta

1. Usuario clickea "Login with start.gg" -> redirect a OAuth con scopes `user.identity`, `user.email`.
2. Callback recibe auth code -> backend intercambia por access_token y refresh_token.
3. Query `CurrentUser` a start.gg -> obtener id, slug, player info.
4. Upsert en `users` y `players` (ambos idempotentes por IDs de start.gg).
5. Emite sesión -> redirige a dashboard.
6. En paralelo, encola `ingestion_job` con `status = PENDING`.

Requests a start.gg: 1 inmediata (CurrentUser) + ~19 asíncronas (ingesta completa).

### 5.2 Worker de ingesta de historial

Procesa jobs de `ingestion_jobs`. Corre en proceso separado (BullMQ + Redis).

1. Toma un job PENDING, marca RUNNING.
2. Query `UserRecentStandings` -> trae ~25 standings (1 request).
3. Filtra singles, upsert en `tournaments`, `events`, `player_standings`.
4. Para cada standing, query `PlayerSetsInEvent` (1 request cada uno).
5. Por cada set:
   - Upsert en `sets`
   - Crea rows "stub" en `players` para oponentes que aún no existan.
   - Si `has_game_data`, uspert en `games`.
   - Incrementa `progress_current`.
6. Al terminar: marca COMPLETED, actualiza `players.ingested_at`.

**Rate limiter**: token bucket de 60 req/min con jitter en backoff. Vive dentro del cliente HTTP de start.gg.

**Errores**: 3 reintentos con backoff exponencial (2s, 4s, 8s...). Si falla definitivamente, marca FAILED y guarda el error.

**Idempotencia**: todos los upserts usan `ON CONFLICT` sobre IDs únicos de start.gg. Re-ejecutar produce el mismo resultado.

### 5.3 Consulta de Player Dossier

1. Backend recibe request autenticado.
2. Resuelve `player_id` por sesión o por slug.
3. Si `players.ingested_at` es NULL o muy viejo: dispara ingesta, responde con estado `processing`.
4. Si está ingestando: ejecuta queries agregadas contra DB propia (standings, stats, matchup data).
5. Responde con JSON o renderiza Server Component.

Requests a start.gg: **0**.

### 5.4 Refresh incremental

1. Lee `players.last_seen_at`.
2. Query `UserRecentStandings` con limit bajo (~10).
3. Filtra los que no existen en DB por `startgg_standing_id`.
4. Para los nuevos, ejecuta sub-flujo de ingesta de sets.

Requests típicas: 1-3.

### 5.5 Scouteo de otro jugador

1. Usuario pega URL tipo `start.gg/user/3f297e74`.
2. Backend parsea slug.
3. Si existe en `players` y `ingested_at` es reciente (<7 días): redirige a dossier.
4. Si existe pero es viejo: dispara refresh incremental.
5. Si no existe: query `GetUserBySlug`, crea row en `players`, encola ingestion_job.

**Rate limiting por usuario**: máximo 5 scouteos/hora por usuario para evitar abuso.

### 5.6 Head-toHead

Query única a DB propia:

```sql
SELECT s.*, t.name, t.start_at
FROM sets s
JOIN events e ON e.id = s.event_id
JOIN tournaments t ON t.id = e.tournament_id
WHERE
    (s.entrant1_player_id = :a AND s.entrant2_player_id = :b)
    OR
    (s.entrant1_player_id = :b AND s.entrant2_player_id = :a)
ORDER BY t.start_at DESC;
```

Requests a start.gg: 0. El schema desnormalizado hace esta query trivial.

### 5.7 Smash Wrapped

Queries agregadas sobre tablas propias: count de torneos, mejor placement del año, ciudades visitadas, rival más común, personaje más usado. Generación de imagen compatible con `@vercel/og`.

---

## 6. Stack técnico

Elecciones justificadas según fit con el proyecto, no "mejor en abstracto".

| Capa | Elección | Razón |
|---|---|---|
| Lenguaje | Typescript | Un solo lenguaje en todo el stack reduce carga cognitiva. Ecosistema maduro. |
| Framework web | Next.js (App Router) | Fullstack en un proyecto. Server Components. Deploy trivial. |
| Base de datos | PostgreSQL (Neon) | Maduro, JSON nativo, gestionado gratis, branching tipo Git útil para testing. |
| ORM | Drizzle | Type safety sin magia pesada. SQL cercano. Migration simples. |
| Queue / Worker | BullMQ + Redis (Upstash) | Estándar de facto. Progress tracking nativo. Retries con backoff. |
| Autenticación | Auth.js (next-auth) con provider custom | Provider de start.gg ya existe en el ecosistema. OAuth listo. |
| UI | React + Tailwind + shadcn/ui | Componentes profesionales sin look genérico. Tailwind tokens. |
| Gráficos | Recharts | Suficiente para MVP. Bar/line/pie directos. | 
| Imágenes | @vercel/og | Generación server-sido de PNG desde JSX. Integra nativo. |
| Hosting web | Vercel | Óptimo para Next.js. Free tier generoso. |
| Hosting worker | Railway / Fly.io | Vercel no sirve para long-running. Railway más simple. |
| Errores | Sentry | Free tier suficiente. Captura frontend + backend. |
| Logs | Axiom o Better Stack | Logs estructurados. Free tier. |
| CI/CD | GitHub Actions | Lint + typecheck + test + auto-deploy. ~30 líneas YAML. |
| Testing | Vitest (unit) + Playwright (E2E) | Stack moderno, integra con Next.js. |

### Alternativas descartadas

- **Python + FastAPI**: excelente pero forzaría dos lenguajes o frontend no-TS.
- **Go**: ideal para workers de alta concurrencia, pero overkill; el cuello de botella es start.gg, no la CPU propia.
- **Prisma en vez de Drizzle**: más maduro pero más pesado y con queries a veces subóptimas.
- **Express + React separado**: más "puro" arquitectónicamente pero duplica setup y deploys sin beneficio real para un proyecto solo.
- **Clerk/Auth0 para auth**: fuerzan flujos que no encajan con OAuth custom de start.gg.

---

## 7. Estructura del repositorio

```
smash-scout/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Login, OAuth callback
│   ├── dashboard/            # Player Dossier del usuario
│   ├── player/[slug]/        # Dossier de otros jugadores
│   ├── h2h/[a]/[b]/          # Head-to-head
│   ├── wrapped/              # Smash Wrapped
│   └── api/                  # Endpoints HTTP
├── db/
│   ├── schema.ts             # Drizzle schema
│   ├── migrations/
│   └── queries/              # Queries reutilizables
├── worker/
│   ├── index.ts              # Entry point del worker
│   ├── startgg-client.ts     # Cliente HTTP + rate limiter
│   ├── jobs/
│   └── queue.ts              # BullMQ setup
├── lib/
│   ├── characters.ts         # Diccionario estático de character IDs
│   ├── startgg-queries.ts    # Queries GraphQL tipadas
│   └── stats.ts              # Cálculos de analytics (pure functions)
├── components/               # React components
├── tests/
├── .env.example
├── .github/workflows/ci.yml
├── drizzle.config.ts
├── next.config.js
└── package.json
```

El worker es un proceso separado del servidor HTTP de Next.js. Mismo repo, despliegues distintos.

---

## 8. Métricas de éxito

### Métricas técnicas (para mostrar en entrevistas)

- Latencia p95 del dashboard: <100ms (consulta a DB propia).
- Tiempo de ingesta inicial: <30ms por usuario (respetando rate limit).
- Uptime durante mes de lanzamiento: >99%.
- Cobertura de tests en `lib/stats.ts` y rate limiter: >70%.

### Métricas de producto (para validación interna)

- $\geq 100$ usuarios registrados reales
- $\geq 1,000$ jugadores indexados en DB.
- $\geq 10$ Smash Wrapped compartidos en redes.

Estas métricas son aspiracionales; el proyecto sigue siendo exitoso aunque no se alcancen, siempre que el código y la arquitectura sean sólidos.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| start.gg cambia API o cierra acceso | DB propia acumula data histórica. Producto degrada pero no muere. |
| Rate limit cambia (más estricto) | Rate limiter configurable vía env var. Ajuste rápido. |
| Coverage de character data peor de lo estimado | Matchup analysis con disclaimers claros. Set-level siempre funciona. |
| Scope creep / abandono del proyecto | Plan de 12 semanas con hitos cóncretos. Un MVP terminado > proyecto perfecto inacabado. |
| Abuso de scouteo (usuarios maliciosos) | Rate limit por usuario (5 scouteos / hora). Logs para detección. |
| Deploy revela bugs no vistos en local | Buffer de 2-3 días en semana 11. Testing E2E en CI. |
| Smash 6 se lanza y Ultimate pierde relevancia | Arquitectura agnóstica a videogame_id. Migración posible. |

---

## 10. Decisiones explícitamente tomadas (no por defecto)

Esta sección es útil para entrevistas: cada punto es una decisión consciente con trade-off.

1. **Elegí ingesta on-demand sobre ingesta masiva**. Trade-off: más complejidad de jobs, pero presupuesto de API viable y DB liviana.
2. **Elegí desnormalizar entrants en `sets` y characters en `games`**. Trade-off: más storage, queries simples y rápidas.
3. **Elegí un worker separado sobre worker inline en Next.js**. Trade-off: más infra (Redis, segundo deploy), mejor separación de concerns y escalabilidad.
4. **Elegí OAuth obligatorio sobre búsqueda libre**. Trade-off: onboarding con fricción, pero resolución limpia de identidad.
5. **Elegí TypeScript end-to-end sobre el mejor lenguaje por capa**. Trade-off: no aprovecho fortalezas de Python en analytics, gano velocidad de desarrollo solo.
6. **Elegí Drizzle sobre Prisma**. Trade-off: ecosistema más joven, control más directo y queries más predecibles.
7. **Elegí Server Components sobre API calls desde el cliente**. Trade-off: código menos familiar para algunos, mejor performance inicial y SEO.
8. **Elegí character dictionary y como archivo estático sobre tabla dinámica**. Trade-off: actualización manual al lanzamiento de nuevos personajes, simplicidad de versionado con Git.

---

## 11. Referencias

- `EXPLORATION_LOG.md` - hallazgos empíricos de la API.
- Plan de 12 semanas con hitos (ver notas del proyecto).
- Documentación oficial de start.gg: https://developer.start.gg/docs/intro/
- Auth.js: https://authjs.dev/
- Drizzle ORM: https://orm.drizzle.team/
- BullMQ: https://docs/bullmq.io/

---

## 12. Changelog de arquitectura

| Fecha | Cambio |
|---|---|
| Inicial | Documento base consolidado tras exploración. |
| 2026-04-28 | OAuth flow implementado con Arctic + Auth.js. Tokens cifrados AES-256-GCM. Sesiones server-side con tabla `sessions` y SHA-256. Middleware de protección de rutas. |
| 2026-04-29 | Cliente start.gg con TokenBucket (60 req/min). Backoff exponencial con jitter. Queries GraphQL tipadas como funciones reutilizables. Refactor del seed y OAuth callback para usar el cliente. |

A actualizar durante la construcción cuando se tomen decisiones nuevas o se ajustan las existentes