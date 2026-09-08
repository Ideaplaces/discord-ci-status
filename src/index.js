// Entry point for the action. Inputs arrive as INPUT_<NAME> env vars, which is
// how GitHub passes them; no @actions/core, no node_modules to ship.

import { readFileSync } from "node:fs";
import { makeClient } from "./discord.js";
import { run } from "./run.js";

function input(name) {
  return (process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] || "").trim();
}

function readEvent(path) {
  if (!path) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

const inputs = {
  webhook: input("webhook"),
  botToken: input("bot-token"),
  status: input("status"),
  title: input("title"),
  description: input("description"),
  footer: input("footer"),
  mention: input("mention"),
  key: input("key"),
};

try {
  await run({
    inputs,
    env: process.env,
    event: readEvent(process.env.GITHUB_EVENT_PATH),
    client: makeClient(),
    warn: (m) => console.log(`::warning::${m}`),
  });
} catch (err) {
  // A notification must never turn a green build red or hide a red one behind
  // a second failure. Say what went wrong in the log and let the job keep its
  // own result.
  console.log(`::warning::discord-ci-status: ${err.message}`);
}
