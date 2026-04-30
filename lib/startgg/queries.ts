import { StartGGClient } from "./client";

/**
 * Constants used across multiple queries.
 */
export const VIDEOGAME_IDS = {
    ULTIMATE: 1386,
    MELEE: 1,
    // Add more as needed
} as const;

// =====================================================================================
// Query: GetCurrentUser
// Used by: auth callback, dashboard
// Cost: 1 request, ~5 complexity
// =====================================================================================
const GET_CURRENT_USER_QUERY = `
  query GetCurrentUser {
    currentUser {
      id
      slug
      name
      genderPronoun
      location {
        country
        state
        city
      }
      player {
        id
        gamerTag
        prefix
      }
    }
  }
`;

export interface CurrentUserResult {
    id: number;
    slug: string;
    name: string | null;
    genderPronoun: string | null;
    location: {
        country: string | null;
        state: string | null;
        city: string | null;
    } | null;
    player: {
        id: number;
        gamerTag: string;
        prefix: string | null;
    } | null;
}

interface CurrentUserResponse {
    currentUser: CurrentUserResult | null;
}

export async function getCurrentUser(client: StartGGClient): Promise<CurrentUserResult> {
    const data = await client.query<CurrentUserResponse>({
        query: GET_CURRENT_USER_QUERY,
    });

    if (!data.currentUser) {
        throw new Error("currentUser is null. Token may not have user.identity scope");
    }

    return data.currentUser;
}

// =====================================================================================
// Query: GetUserBySlug
// User by: scouting flow (search for other players)
// Cost: 1 request, ~5 complexity
// =====================================================================================
const GET_USER_BY_SLUG_QUERY = `
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
`;

export interface UserBySlugResult {
    id: number;
    slug: string;
    name: string | null;
    bio: string | null;
    genderPronoun: string | null;
    location: {
        country: string | null;
        state: string | null;
        city: string | null;
    } | null;
    images: Array<{
        url: string;
        type: string;
    }> | null;
    player: {
        id: number;
        gamerTag: string;
        prefix: string | null;
    } | null;
}

interface UserBySlugResponse {
    user: UserBySlugResult | null;
}

export async function getUserBySlug(
    client: StartGGClient,
    args: { slug: string },
): Promise<UserBySlugResult | null> {
    const data = await client.query<UserBySlugResponse>({
        query: GET_USER_BY_SLUG_QUERY,
        variables: { slug: args.slug }, 
    });

    return data.user;
}

// ========================================================================================
// Query: GetUserRecentStandings
// User by: ingestion worker (week 4)
// Cost: 1 request, ~120 complexity for 20 standings
// ========================================================================================
const GET_USER_RECENT_STANDINGS_QUERY = `
  query GetUserRecentStandings($slug: String!, $perPage: Int!, $videogameId: ID!) {
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
`;

export interface RecentStanding {
    id: number;
    placement: number;
    entrant: {
        id: number;
        name: string;
        event: {
            id: number;
            name: string;
            numEntrants: number;
            tournament: {
                id: number;
                name: string;
                slug: string;
                startAt: number;
                city: string | null;
                countryCode: string | null;
            };
        };
    };
}

interface UserRecentStandingsResponse {
    user: {
        id: number;
        player: {
            id: number;
            gamerTag: string;
            recentStandings: RecentStanding[];
        } | null;
    } | null;
}

export async function getUserRecentStandings(
    client: StartGGClient,
    args: { slug: string; videogameId: number; perPage: number },
): Promise<RecentStanding[]> {
    const data = await client.query<UserRecentStandingsResponse>({
        query: GET_USER_RECENT_STANDINGS_QUERY,
        variables: {
            slug: args.slug,
            videogameId: String(args.videogameId), // GraphQL type expects string
            perPage: args.perPage,
        },
    });

    if (!data.user?.player) {
        return [];
    }

    return data.user.player.recentStandings;
}

// =========================================================================================
// Query: GetPlayerSetsInEvent
// User by: ingestion worker (week 4)
// Cost: 1 request, ~300 complexity for 8 sets with games
// =========================================================================================
const GET_PLAYER_SETS_IN_EVENT_QUERY = `
  query GetPlayerSetsInEvent($eventId: ID!, $entrantId: ID!) {
    event(id: $eventId) {
      id
      name
      sets(
        perPage: 50
        page: 1
        filters: { entrantIds: [$entrantId] }
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
`;

export interface SetGame {
    id: number;
    winnerId: number | null;
    orderNum: number;
    selections: Array<{
        entrant: { id: number };
        selectionType: string;
        selectionValue: number;
    }>;
    stage: {
        id: number;
        name: string;
    } | null;
}

export interface SetSlot {
    id: string;
    entrant: {
        id: number;
        name: string;
        participants: Array<{
            player: {
                id: number;
                gamerTag: string;
            };
        }>;
    } | null;
    standing: {
        placement: number;
        stats: {
            score: {
                value: number | null;
            } | null;
        } | null;
    } | null;
}

export interface PlayerSet {
    id: number;
    fullRoundText: string | null;
    round: number | null;
    winnerId: number | null;
    displayScore: string | null;
    completedAt: number | null;
    slots: SetSlot[];
    games: SetGame[] | null;
}

interface PlayerSetsInEventResponse {
    event: {
        id: number;
        name: string;
        sets: {
            pageInfo: { total: number };
            nodes: PlayerSet[];
        };
    } | null;
}

export async function getPlayerSetsInEvent(
    client: StartGGClient,
    args: { eventId: number; entrantId: number },
): Promise<PlayerSet[]> {
    const data = await client.query<PlayerSetsInEventResponse>({
        query: GET_PLAYER_SETS_IN_EVENT_QUERY,
        variables: {
            eventId: String(args.eventId),
            entrantId: String(args.entrantId),
        },
    });

    if (!data.event) {
        throw new Error(`Event ${args.eventId} not found or not accessible`);
    }

    return data.event.sets.nodes;
}

// =======================================================================================
// Query: GetUltimateCharacters
// User by: characters seed script
// Cost: 1 request, very low complexity
// Note: this query is also used in db/seeds/seed-characters.ts (predates this refactor)
// =======================================================================================
const GET_ULTIMATE_CHARACTERS_QUERY = `
  query GetUltimateCharacters($videogameId: ID!) {
    videogame(id: $videogameId) {
      id
      name
      characters {
        id
        name
      }
    }
  }
`;

export interface CharacterInfo {
    id: number;
    name: string;
}

interface UltimateCharactersResponse {
    videogame: {
        id: number;
        name: string;
        characters: CharacterInfo[];
    } | null;
}

export async function getUltimateCharacters(client: StartGGClient): Promise<CharacterInfo[]> {
    const data = await client.query<UltimateCharactersResponse>({
        query: GET_ULTIMATE_CHARACTERS_QUERY,
        variables: { videogameId: String(VIDEOGAME_IDS.ULTIMATE) },
    });

    if (!data.videogame) {
        throw new Error(`Videogame ${VIDEOGAME_IDS.ULTIMATE} not found`);
    }

    return data.videogame.characters;
}