import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/run.js";
import { MARKER } from "../src/lib.js";

const env = {
  GITHUB_WORKFLOW_REF: "Ideaplaces/r/.github/workflows/deploy.yml@refs/heads/main",
  GITHUB_JOB: "build-and-deploy",
  GITHUB_REF_NAME: "main",
  GITHUB_REPOSITORY: "Ideaplaces/r",
  GITHUB_RUN_ID: "42",
  GITHUB_ACTOR: "crarau",
};
const webhook = "https://discord.com/api/webhooks/777/tok";
const key = "deploy.yml/build-and-deploy@main";

function fakeClient(messages = []) {
  const calls = [];
  return {
    calls,
    post: async (id, token, payload) => {
      calls.push(["post", id, payload]);
      return { id: "new" };
    },
    webhookInfo: async (id) => {
      calls.push(["info", id]);
      return { id, channel_id: "chan" };
    },
    channelMessages: async (bot, channel) => {
      calls.push(["list", bot, channel]);
      return messages;
    },
    deleteOwn: async (id, token, mid) => {
      calls.push(["delete", id, mid]);
      return null;
    },
  };
}
const quiet = { log: () => {}, warn: () => {} };

test("failure posts one embed and deletes nothing", async () => {
  const client = fakeClient();
  const out = await run({ inputs: { webhook, botToken: "B", status: "failure", title: "r deploy failed" }, env, event: {}, client, ...quiet });
  assert.equal(out.action, "posted");
  assert.equal(out.key, key);
  assert.equal(client.calls.length, 1);
  const [, id, payload] = client.calls[0];
  assert.equal(id, "777");
  assert.equal(payload.embeds[0].title, ":x: r deploy failed");
  assert.ok(payload.embeds[0].url.endsWith(MARKER + encodeURIComponent(key)));
});

test("success deletes this key's earlier failures and only those", async () => {
  const mk = (id, k, webhook_id = "777") => ({ id, webhook_id, embeds: [{ url: `https://github.com/r/actions/runs/1${MARKER}${encodeURIComponent(k)}` }] });
  const client = fakeClient([mk("a", key), mk("b", "deploy.yml/build-and-deploy@develop"), mk("c", key, "999"), mk("d", key)]);
  const out = await run({ inputs: { webhook, botToken: "B", status: "success", title: "t" }, env, event: {}, client, ...quiet });
  assert.equal(out.action, "cleared");
  assert.deepEqual(out.deleted, ["a", "d"]);
  assert.deepEqual(client.calls.filter((c) => c[0] === "delete").map((c) => c[2]), ["a", "d"]);
  assert.deepEqual(client.calls[1], ["list", "B", "chan"]);
});

test("an explicit key overrides the derived one", async () => {
  const mk = (id, k) => ({ id, webhook_id: "777", embeds: [{ url: `u${MARKER}${encodeURIComponent(k)}` }] });
  const client = fakeClient([mk("x", "custom"), mk("y", key)]);
  const out = await run({ inputs: { webhook, botToken: "B", status: "success", title: "t", key: "custom" }, env, event: {}, client, ...quiet });
  assert.deepEqual(out.deleted, ["x"]);
});

test("success without a bot token warns and touches nothing", async () => {
  const client = fakeClient();
  const warned = [];
  const out = await run({ inputs: { webhook, botToken: "", status: "success", title: "t" }, env, event: {}, client, log: () => {}, warn: (m) => warned.push(m) });
  assert.equal(out.action, "none");
  assert.equal(client.calls.length, 0);
  assert.equal(warned.length, 1);
});

test("cancelled and skipped do nothing at all", async () => {
  for (const status of ["cancelled", "skipped", ""]) {
    const client = fakeClient();
    const out = await run({ inputs: { webhook, botToken: "B", status, title: "t" }, env, event: {}, client, ...quiet });
    assert.equal(out.action, "none");
    assert.equal(client.calls.length, 0);
  }
});

test("an empty webhook is a no-op, not an error", async () => {
  const client = fakeClient();
  const out = await run({ inputs: { webhook: "", status: "failure", title: "t" }, env, event: {}, client, ...quiet });
  assert.equal(out.action, "none");
  assert.equal(client.calls.length, 0);
});
