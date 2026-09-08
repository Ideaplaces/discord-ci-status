import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKER,
  RED,
  defaultDescription,
  failurePayload,
  markedUrl,
  parseWebhook,
  staleMessages,
  streamKey,
} from "../src/lib.js";

const env = {
  GITHUB_WORKFLOW_REF: "Ideaplaces/ideaplaces-tour-platform/.github/workflows/ci.yml@refs/heads/develop",
  GITHUB_JOB: "verify",
  GITHUB_REF_NAME: "260/merge",
  GITHUB_HEAD_REF: "feature/phone-board",
  GITHUB_REPOSITORY: "Ideaplaces/ideaplaces-tour-platform",
  GITHUB_RUN_ID: "34267286052",
  GITHUB_ACTOR: "crarau",
  GITHUB_SHA: "abcdef0123456789",
};

test("streamKey is workflow file, job and the PR head branch", () => {
  assert.equal(streamKey(env), "ci.yml/verify@feature/phone-board");
});

test("streamKey falls back to ref_name on a push", () => {
  assert.equal(streamKey({ ...env, GITHUB_HEAD_REF: "" }), "ci.yml/verify@260/merge");
});

test("markedUrl is the run URL plus an encoded fragment GitHub ignores", () => {
  assert.equal(
    markedUrl(env, "ci.yml/verify@feature/phone-board"),
    "https://github.com/Ideaplaces/ideaplaces-tour-platform/actions/runs/34267286052#ci-status=ci.yml%2Fverify%40feature%2Fphone-board",
  );
});

test("parseWebhook reads id and token, with or without a version", () => {
  assert.deepEqual(parseWebhook("https://discord.com/api/webhooks/123/abc_DEF-9"), { id: "123", token: "abc_DEF-9" });
  assert.deepEqual(parseWebhook("https://discord.com/api/v10/webhooks/123/tok?wait=true"), { id: "123", token: "tok" });
  assert.throws(() => parseWebhook("https://example.com/nope"), /not a Discord webhook/);
});

test("defaultDescription prefers the push commit, then the PR title, then the sha", () => {
  const push = { head_commit: { message: "Fix the thing\n\nlonger body" } };
  assert.equal(defaultDescription(env, push), "**Commit:** Fix the thing\n**Branch:** feature/phone-board\n**By:** crarau");
  const pr = { pull_request: { title: "The phone board" } };
  assert.match(defaultDescription(env, pr), /^\*\*Commit:\*\* The phone board\n/);
  assert.match(defaultDescription(env, {}), /^\*\*Commit:\*\* abcdef0\n/);
});

test("failurePayload carries the marker, the red colour, the footer and the mention", () => {
  const p = failurePayload({
    env,
    event: {},
    key: "k@main",
    title: "tour-platform CI failed",
    footer: "production | tourcockpit.com",
    mention: "<@1>",
  });
  assert.equal(p.content, "<@1>");
  assert.equal(p.embeds.length, 1);
  const e = p.embeds[0];
  assert.equal(e.title, ":x: tour-platform CI failed");
  assert.equal(e.color, RED);
  assert.deepEqual(e.footer, { text: "production | tourcockpit.com" });
  assert.ok(e.url.endsWith(MARKER + "k%40main"));
  assert.match(e.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("failurePayload omits content and footer when not given", () => {
  const p = failurePayload({ env, event: {}, key: "k", title: "t", description: "d" });
  assert.equal("content" in p, false);
  assert.equal("footer" in p.embeds[0], false);
  assert.equal(p.embeds[0].description, "d");
});

test("staleMessages keeps only this webhook's embeds for exactly this key", () => {
  const mine = (id, key, extra = {}) => ({
    id,
    webhook_id: "W",
    embeds: [{ url: `https://github.com/r/actions/runs/1${MARKER}${encodeURIComponent(key)}` }],
    ...extra,
  });
  const messages = [
    mine("1", "ci.yml/verify@main"),
    mine("2", "ci.yml/verify@main2"),
    mine("3", "ci.yml/verify@main", { webhook_id: "OTHER" }),
    mine("4", "deploy.yml/build@main"),
    { id: "5", webhook_id: "W", embeds: [{ url: "https://github.com/r/actions/runs/1" }] },
    { id: "6", webhook_id: "W", content: "plain text", embeds: [] },
    { id: "7", author: { username: "chip" } },
    mine("8", "ci.yml/verify@main"),
  ];
  assert.deepEqual(
    staleMessages(messages, "W", "ci.yml/verify@main").map((m) => m.id),
    ["1", "8"],
  );
});
