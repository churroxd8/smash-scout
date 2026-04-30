import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  StartGGClient,
  StartGGAuthError,
  StartGGRateLimitError,
  StartGGGraphQLError,
  StartGGError,
} from "./client";

describe("StartGGClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * Helper to build a fake fetch response with a given status and JSON body.
   */
  function mockResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  describe("constructor", () => {
    it("requires a token", () => {
      expect(() => new StartGGClient({ token: "" })).toThrow();
    });

    it("accepts a token", () => {
      const client = new StartGGClient({ token: "test-token" });
      expect(client.availableTokens()).toBe(60);
    });

    it("respects custom rate limit options", () => {
      const client = new StartGGClient({
        token: "test-token",
        capacity: 10,
        refillPerSecond: 0.5,
      });
      expect(client.availableTokens()).toBe(10);
    });
  });

  describe("query: success", () => {
    it("returns the data field on a successful response", async () => {
      fetchMock.mockResolvedValue(mockResponse(200, { data: { hello: "world" } }));

      const client = new StartGGClient({ token: "test-token" });
      const result = await client.query<{ hello: string }>({ query: "{ hello }" });

      expect(result).toEqual({ hello: "world" });
    });

    it("sends the query and variables as JSON body", async () => {
      fetchMock.mockResolvedValue(mockResponse(200, { data: {} }));

      const client = new StartGGClient({ token: "test-token" });
      await client.query({
        query: "query Q($id: ID!) { thing(id: $id) }",
        variables: { id: "42" },
      });

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs?.[1].body as string);
      expect(body.query).toContain("thing(id: $id)");
      expect(body.variables).toEqual({ id: "42" });
    });

    it("includes the Bearer token in the Authorization header", async () => {
      fetchMock.mockResolvedValue(mockResponse(200, { data: {} }));

      const client = new StartGGClient({ token: "secret-token" });
      await client.query({ query: "{ x }" });

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs?.[1].headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer secret-token");
    });

    it("consumes a token from the bucket per request", async () => {
      fetchMock.mockResolvedValue(mockResponse(200, { data: {} }));

      const client = new StartGGClient({ token: "test-token" });
      const before = client.availableTokens();
      await client.query({ query: "{ x }" });
      const after = client.availableTokens();

      expect(after).toBeLessThan(before);
    });
  });

  describe("query: errors", () => {
    it("throws StartGGAuthError on 401", async () => {
      fetchMock.mockResolvedValue(mockResponse(401, { error: "unauthorized" }));

      const client = new StartGGClient({ token: "test-token" });
      await expect(client.query({ query: "{ x }" })).rejects.toThrow(StartGGAuthError);
    });

    it("throws StartGGAuthError on 403", async () => {
      fetchMock.mockResolvedValue(mockResponse(403, { error: "forbidden" }));

      const client = new StartGGClient({ token: "test-token" });
      await expect(client.query({ query: "{ x }" })).rejects.toThrow(StartGGAuthError);
    });

    it("throws StartGGRateLimitError on 429", async () => {
      fetchMock.mockResolvedValue(mockResponse(429, { error: "rate_limit" }));

      const client = new StartGGClient({ token: "test-token" });
      await expect(client.query({ query: "{ x }" })).rejects.toThrow(StartGGRateLimitError);
    });

    it("throws StartGGError on 500", async () => {
      fetchMock.mockResolvedValue(mockResponse(500, { error: "internal" }));

      const client = new StartGGClient({ token: "test-token" });
      await expect(client.query({ query: "{ x }" })).rejects.toThrow(StartGGError);
    });

    it("throws StartGGGraphQLError when the response has errors", async () => {
      fetchMock.mockResolvedValue(
        mockResponse(200, {
          errors: [{ message: "Field 'foo' not found" }],
        }),
      );

      const client = new StartGGClient({ token: "test-token" });
      await expect(client.query({ query: "{ foo }" })).rejects.toThrow(StartGGGraphQLError);
    });

    it("throws StartGGError on network failure", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

      const client = new StartGGClient({ token: "test-token" });
      await expect(client.query({ query: "{ x }" })).rejects.toThrow(StartGGError);
    });
  });
});