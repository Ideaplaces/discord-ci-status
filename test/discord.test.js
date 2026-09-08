import { test } from "node:test";
import assert from "node:assert/strict";
import { makeClient } from "../src/discord.js";

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body ?? ""),
  };
}

test("a 429 is retried after retry_after seconds, then the call succeeds", async () => {
  const calls = [];
  const slept = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method });
    return calls.length === 1 ? response(429, { retry_after: 0.5 }) : response(200, { id: "m1" });
  };
  const client = makeClient({ fetchImpl, sleep: async (ms) => slept.push(ms) });
  const out = await client.post("1", "tok", { embeds: [] });
  assert.deepEqual(out, { id: "m1" });
  assert.equal(calls.length, 2);
  assert.deepEqual(slept, [600]);
  assert.equal(calls[0].url, "https://discord.com/api/v10/webhooks/1/tok?wait=true");
});

test("a non-2xx answer throws with the status and never leaks the webhook token", async () => {
  const client = makeClient({ fetchImpl: async () => response(400, { message: "bad" }) });
  await assert.rejects(client.post("1", "secret-token", {}), (err) => {
    assert.match(err.message, /-> 400/);
    assert.doesNotMatch(err.message, /secret-token/);
    return true;
  });
});

test("deleteOwn treats 204 as done and sends no body", async () => {
  let seen;
  const client = makeClient({
    fetchImpl: async (url, opts) => {
      seen = { url, opts };
      return { status: 204, ok: true, json: async () => null, text: async () => "" };
    },
  });
  assert.equal(await client.deleteOwn("1", "tok", "m9"), null);
  assert.equal(seen.url, "https://discord.com/api/v10/webhooks/1/tok/messages/m9");
  assert.equal(seen.opts.method, "DELETE");
  assert.equal(seen.opts.body, undefined);
});

test("channelMessages pages with before= until a short page", async () => {
  const pages = [
    Array.from({ length: 100 }, (_, i) => ({ id: String(1000 - i) })),
    [{ id: "5" }, { id: "4" }],
  ];
  const urls = [];
  const client = makeClient({
    fetchImpl: async (url, opts) => {
      urls.push(url);
      assert.equal(opts.headers.Authorization, "Bot B");
      return response(200, pages.shift());
    },
  });
  const all = await client.channelMessages("B", "C");
  assert.equal(all.length, 102);
  assert.equal(urls[0], "https://discord.com/api/v10/channels/C/messages?limit=100");
  assert.equal(urls[1], "https://discord.com/api/v10/channels/C/messages?limit=100&before=901");
});
