# Exploration Log - start.gg GraphQL API

Documento de hallazgos empíricos de la fase de exploración de la API de start.gg, previa al diseño de arquitectura de **Smash Scout**. Sirve como referencia técnica durante la construcción y como material de apoyo para entrevistas.

**Periodo de exploración**: abril 2026
**Juego objetivo**: Super Smash Bros. Ultimate (`videogameId: 1386`)
**Endpoint**: `https://api.start.gg/gql/alpha`
**Autenticación**: Bearer token (developer portal) para exploración; OAuth 2.0 planeado para producción.

---

## Resumen ejecutivo

- La API **no permite buscar jugadores por gamertag de forma global**. La identidad de jugadores se resuelve por `slug` de perfil o por ID numérico, no por búsqueda de texto libre.
- El error "campo inexistente" viene en `errors[]`; "recurso no encontrado o inaccesible" viene como `null` en `data`. **Ambos casos deben manejarse por separado en el cliente**.
- Los **rate limits son por número de requests, no por complexity**: ~75-80 req/min antes de recibir HTTP 429. Budget de trabajo recomendado: **60 req/min**.
- La **character data tiene coverage variable**: ~100% en sets de top cut / stream, significativamente menor en pools tempranos. Estimación global razonable: 50-70%.
- La **ingesta completa de un evento masivo (ej. Genesis X3, ~1,600 sets) supera el presupuesto razonable**. La estrategia correcta es la ingesta on-demand por usuario (filtrada con `entrantIds`), no ingesta masiva por torneo.
- Tres queries cubren el 90% del producto: `UserRecentStandings`, `PlayerSetsInEvent`, y `GetUserBySlug`.
- Los tokens de acceso de start.gg expiran después de 8 días (no en 1 hora).
- **Estrategia**: refrescado bajo demanda cuando el token esté a punto de expirar, no constantemente (preemptively).

---

## 1. Autenticación y acceso

- Token tipo Bearer obtenido en https://developer.start.gg/.
- Header requerido: `Authorization: Bearer <TOKEN>`.
- La API es GraphQL: un solo endpoint POST.
- Tokens tienen validez de un año.

**Para producción**: implementar OAuth 2.0 con scopes `user.identity` y `user.email` (confirmado por documentación y por librería `arctic`). Los tokens de OAuth expiran y requieren refresh flow.

---

## 2. Identidades en el modelo de datos de start.gg

La API distingue cuatro entidades conceptuales distintas:

- **`User`**: cuenta de start.gg (entidad global, up-to-date).
- **`Player`**: identidad competitiva global, con gamerTag y prefix actuales.
- **`Participant`**: captura point-in-time de un player al registrarse en un torneo.
- **`Entrant`**: captura point-in-time del registro (puede ser team en doubles).

**Implicaciones para el diseño**:

- El gamerTag actual vive en `Player.gamerTag` y es la fuente de verdad estable.
- El nombre histórico con sponsor vive en `Entrant.name` y es point-in-time.
- Hay jugadores con `Player` pero sin `User` asociado (casos raros; regidores modelan con nullable).

---

## 3. Queries validadas

Las siguientes queries fueron probadas y funcionan. Están listas para copy-paste al cliente GraphQL del proyecto.

### 3.1 Buscar entrants por nombre dentro de un evento

No existe búsqueda global de players; la alternativa es buscar entrants dentro de un evento específico con filtro de nombre.

```graphql
query SearchEntrantInEvent($eventId: ID!, $search: String!) {
    event(id: $eventId) {
        id
        name
        entrants(query: {
            perPage: 20
            page: 1
            filter: { name: $search }
        }) {
            nodes {
                id
                name
                participants {
                    player {
                        id
                        gamerTag
                        user {
                            slug
                        }
                    }
                }
            }
        }
    }
}
```

**Comportamiento**: match de substring case-sensitive sobre `entrant.name`. Buscando "Leo" en un evento devuelve MKLeo, Leonidas, LeoX, etc. El campo `player.user.slug` es el identificador canónico para el resto del producto.

### 3.2 Obtener usuario por slug

```graphql
query GetUserBySlug($slug: String!) {
    user(slug: $slug) {
        id
        slug
        name
        bio
        genderPronoun
        location {
            country
            state
            city
        }
        images {
            url
            type
        }
        player {
            id
            gamerTag
            prefix
        }
    }
}
```

**Uso**: dado un slug como `user/3f297e74` (copiado del URL de start.gg), obtener el perfil completo. Este es el pivote central del producto.

### 3.3 Standings recientes de un usuario (feature estrella)

```graphql
query UserRecentStandings($slug: String!, $perPage: Int!, $videogameId: ID!) {
    user(slug: $slug) {
        id
        player {
            id
            gamerTag
            recentStandings(videogameId: $videogameId, limit: $perPage) {
                id
                placement
                entrant {
                    id
                    name
                    event {
                        id
                        name
                        numEntrants
                        tournament {
                            id
                            name
                            slug
                            startAt
                            city
                            countryCode
                        }
                    }
                }
            }
        }
    }
}
```

**Uso**: alimenta la timeline de torneos y la mayoría del Player Dossier. Una sola query resuelve el ~70% del dashboard.

### 3.4 Sets de un jugador en un evento (head-to-head y matchup data)

```graphql
query PlayerSetsInEvent($eventId: ID!, $entrantId: ID!) {
    event(id: $eventId) {
        id
        name
        sets(
            perPage: 50
            page: 1
            filters: { entrantsIds: [$entrantId] }
        ) {
            pageInfo { total }
            nodes {
                id
                fullRoundText
                round
                winnerId
                displayScore
                completedAt
                slots {
                    id
                    entrant {
                        id
                        name
                        participants {
                            player {
                                id
                                gamerTag
                            }
                        }
                    }
                    standing {
                        placement
                        stats {
                            score {
                                value
                            }
                        }
                    }
                }
                games {
                    id
                    winnerId
                    orderNum
                    selections {
                        entrant { id }
                        selectionType
                        selectionValue
                    }
                    stage {
                        id
                        name
                    }
                }
            }
        }
    }
}
```

**Uso**: por cada standing ingestado, esta query trae los sets jugados por el usuario en ese evento. Es el insumo para matchup analysis y head-to-head.

### 3.5 Obtener events de un torneo

```graphql
query GetTournamentEvents($slug: String!) {
    tournament(slug: $slug) {
        id
        name
        events {
            id
            name
            numEntrants
            videogame {
                id
                name
            }
        }
    }
}
```

**Uso**: dado un slug de torneo, obtener sus eventIds para filtrar solo Ultimate Singles.

---

## 4. Comportamiento de errores

**Dos modos distintos que deben manejarse por separado**:

### Modo A: error de schema

Cuando un campo no existe o la query es inválida, la respuesta incluye `errors[]`:

```json
{
    "errors": [
        {
            "message": "Cannot query field \"players\" on type \"Query\". Did you mean \"player\"?",
            "locations": [{"line": 2, "column": 3}]
        }
    ]
}
```

### Modo B: recurso no encontrado o inaccesible

Cuando un recurso no existe o el usuario no tiene permiso, el campo regresa `null` **sin errores**:

```json
{
    "data": {
        "event": null
    },
    "extensions": {
        "cacheControl": {
            "hints": [{
                "path": ["event"],
                "scope": "PRIVATE"
            }]
        }
    }
}
```

**Implicación para el cliente**: validar tanto `response.errors` como cada campo del `data` contra `null` antes de usarlo.

---

## 5. Rate limits (medición empírica)

Script de medición: `scripts/stats.py`. Dos tests en secuencia, 60s de pausa entre ellos.

### Test 1 - Queries pesadas (~300 complexity cada una)

- **91 requests** sin bloqueo antes de timeout del test.
- **54,964 complexity points acumulados** sin bloqueo.
- Ritmo: ~45 req/min, ~27,000 cx/min.

### Test 2 - Queries baratas (~1 complexity cada una)

- **Bloqueo tras 150 requests** con HTTP 429.
- **Solo 150 complexity points acumulados** al momento del bloqueo.
- Ritmo: ~75 req/min.

### Headers y respuesta al bloqueo

```
HTTP 429
{"success":false,"message":"Rate limit exceeded - api-token","errorId":"fa5b22"}
```

**No hay header `Retry-After`**. La respuesta no indica cuánto esperar.

### Conclusión

La API limita por **requests por ventana de tiempo**, no por complexity. El techo observado es ~75-80 req/min.

**Budget de trabajo recomendado: 60 req/min** (margen del 25% para picos y reintentos).

**Implicaciones arquitectónicas**:

- Optimizar por **empaquetar mucho en pocas requests**, no por minimizar complexity.
- Rate limiter propio en el worker, con token bucket de 60 req/min.
- Backoff exponencial manual ante 429 (2s, 4s, 8s, ... hasta 60s; reset al siguiente éxito).
- Prespuesto de throughput: ~5 usuarios nuevos por minuto en onboarding completo (~11 requests por usuario).

---

## 6. Complexity por operación

Tabla empírica construida durante la exploración. Útil para proyectar costos.

| Operación | Requests | Complexity |
|---|---:|---:|
| Búsqueda de entrants en evento (Query 3.1) | 1 | 10 |
| Perfil básico de usuario (Query 3.2) | 1 | ~5 |
| 20 standings recientes (Query 3.3) | 1 | 122 |
| Sets completos de un jugador en un evento (Query 3.4) | 1 | 300 |
| Muesta de 30 sets simplificados (Query 4.1) | 1 | 396 |

**Flujos compuestos**:

- **Onboarding inicial de usuario**: 1 (standings) + ~18 (sets por torneo) = **~19 requests** (~5-10 minutos humanos si se procesa al ritmo del rate limiter, ~20 segundos si se respeta budget y no hay contención).
- **Refresh incremental**: 1-3 requests típicamente.
- **Scouteo de otro jugador**: mismo costo que onboarding.
- **Consulta en UI (post-ingesta)**: 0 requests (todo sale de DB propia).

---

## 7. Character data coverage

La disponibilidad de character data es **variable y depende del contexto del set dentro del bracket**, no solo del torneo.

### Muestras tomadas

| Toreno | Tamaño | Muestra | Coverage character | Sets sin games |
|---|---:|---:|---:|---:|
| Best of the West IV: Meteor Crash (MKLeo, solo sus sets) | 153 | 8 sets | 62.5% set-level | 3 de 8 |
| Genesis X3, Ultimate Singles (top-cut visible) | 790 | 30 sets | 100% game-level | 0 de 30 |

### Patrón identificado

- **Top cut / stream sets**: ~100% coverage (setups de streaming con moderadores).
- **Pools tempranos / setups paralelos sin moderación**: 20-50% coverage típicamente.
- **Estimación global por torneo**: 40-75% según proporción top cut vs pools.

### Implicaciones para features

- **Matchup analysis es viable** con disclaimers: "Basado en X de Y sets con data de personajes".
- **Indicador de coverage en UI** debe acompañar cualquier stat de characters.
- **Set-level es atómico** (siempre presente); game-level/character-level es opcional.
- **Stage data** es aún más inconsistente (en la muestra de Best of the West IV, siempre es `null`). Feature de "winrate por stage" queda fuera del MVP.

---

## 8. Incosistencias conocidas en los datos

- **Nombres de evento no consistentes**: el mismo tipo de evento aparece como `"Ultimate Singles"`, `"Smash Ultimate Singles"`, `"Smash Bros Ultimate"`, `"SMASH SINGLES"`, `"Super Smash Bros. Ultimate"`. **No parsear por string**; usar `videogameId` y otros campos estructurados.
- **Singles vs doubles**: no se puede distinguir confiablemente por string. Indicadores observados: `entrant.name` con `/` (ej. `"MKBigBoss / MKLeo"`) sugiere doubles. Verificar en schema si existe un campo `teamRosterSize` o `isTeamEvent`.
- **Location null**: cuando un torneo es online, `city` y `countryCode` son `null`. Usar esto como señal para clasificar `online` vs `offline`.
- **Sponsor prefix cambia en el tiempo**: `entrant.name` captura el prefix en ese torneo (point-in-time), mientras que `player.gamerTag` es el actual. Para mostrar nombre "bonito" actual, usar `player.gamerTag`.
- **Rankings en respuestas grandes pueden tener errores**: documentación de start.gg lo menciona para torneos grandes.

---

## 9. IDs relevantes (para pruebas y seeds)

Datos reales obtenidos durante exploración, útiles para tests y fixtures durante desarrollo.

### Juego
- `videogameId: 1386` - Super Smash Bros. Ultimate
- `videogameId: 1` - Super Smash Bros. Melee

### Jugador de referencia (MKLeo)
- `startgg_player_id: 222927`
- `startgg_user_slug: "user/3f297e74"`
- `gamerTag: "MKLeo"`

### Eventos de referencia (Ultimate Singles)
- `1538653` - Best of the West IV: Meteor Crash (153 entrantes, Heroica Nogales, MX, 1st)
- `1594479` - Orion Monthly #10 (104 entrantes, Hermosillo, MX, 1st)
- `1424385` - Genesis X3 (790 entrantes, San Jose, US, 17th)
- `1587005` - The Cashbox #20 (558 entrantes, online, 17th)

### Characters IDs observados (para diccionario)
- `1795` - Joker
- `1327` - Steve
- `1329` - Mario
- `1331`, `1301`, `1453` - pendiente de confirmar contra diccionario comunitario

**TODO**: armar `characters.json` completo a partir de repositorios comunitarios de mapping character_id -> nombre.

---

## 10. Decisiones derivadas de la exploración

Las siguientes decisiones arquitectónicas fueron tomadas con base en los hallazgos anteriores. Ver `ARCHITECTURE.md` para el desarrollo completo.

1. **OAuth con start.gg desde el día 1**. La falta de búsqueda global de players hace indispensable que el usuario se identifique vía OAuth para resolver "quién soy".
2. **Slug como identificador canónico del usuario en el dominio público**. URLs del tipo `/player/user/3f297e74`.
3. **Ingesta on-demand por usuario, no masiva por torneo**. El costo de ingestar un evento grande completo supera cualquier budget razonable.
4. **Worker asíncrono con rate limiter de 60 req/min**. BullMQ + Redis + token bucket propio.
5. **Schema desnormalizado en tablas `sets` y `games`** para hacer head-to-head y matchup analysis queries baratas en DB propia.
6. **Lazy indexing de players "stub"**: cuando aparece un oponente desconocido en un set, se crea un row mínimo en `players` sin disparar ingesta completa. La ingesta completa se dispara solo si alguien scoutea a esa persona.
7. **Set como unidad atómica, Game como relación opcional** con flag `has_game_data`. Refleja la realidad de la coverage variable.
8. **Path síncrono (UI <-> DB) y path asíncrono (Worker <-> start.gg) completamente desacoplados**. La UI nunca espera a start.gg; siempre lee la DB propia.

---

## 11. Trampas evitadas durante la exploración

- No intentar `players(query: ...)` como top-level query. No existe.
- No hardcodear `eventId` placeholder; usar slugs reales de torneos existentes.
- No ignorar `games: null`; es información válida (TO no registró data).
- No basar la identificación de singles/doubles en parsing de strings.
- No asumir que rate limit es por complexity; medición empírica confirmó que es por requests.

---

## 12. Estado final de la exploración

**Cerrada**. Todos los bloques completados:

- [x] Bloque 1 - Autenticación y primeras queries
- [x] Bloque 2 - Historial de torneos
- [x] Bloque 3 - Sets y head-to-head
- [x] Bloque 4 - Character coverage (muestreo representativo)
- [x] Bloque 5 - Descubrimiento de torneos
- [x] Bloque 6 - Rate limits
- [x] Bloque 7 - Proyección de costos compuestos

**Entregable**: el MVP definido en `ARCHITECTURE.md` es técnicamente viable dentro de los límites de la API y del timeline de 12 semanas.   