# discord-ci-status

A GitHub Action that posts a CI or deploy failure to a Discord channel and deletes it again when the same workflow, job and branch go green. A channel only ever shows what is broken right now. A failure that has been fixed leaves no trace.

## Why

Failure-only notifications pile up. Every red run adds an embed, nothing removes it, and a week later the channel is a list of problems that were all solved. Reading it means opening each run to check whether it still matters. This action makes the channel the answer: if a failure is still there, it is still broken.

## Usage

Last step of the job, with `if: always()`:

```yaml
      - name: Discord CI status
        if: always()
        uses: Ideaplaces/discord-ci-status@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK_MYPROJECT_PRODUCTION }}
          bot-token: ${{ secrets.DISCORD_BOT_TOKEN }}
          status: ${{ job.status }}
          title: myproject production build failed
          footer: production | myproject.com
          mention: "<@908834861526175844>"
```

For a workflow with several jobs, add a notify job that needs the others and derive the status from their results:

```yaml
  notify:
    needs: [build, test]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: Ideaplaces/discord-ci-status@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK_MYPROJECT_PRODUCTION }}
          bot-token: ${{ secrets.DISCORD_BOT_TOKEN }}
          status: ${{ contains(needs.*.result, 'failure') && 'failure' || contains(needs.*.result, 'cancelled') && 'cancelled' || 'success' }}
          title: myproject CI failed
```

`DISCORD_BOT_TOKEN` is an organization secret on Ideaplaces, available to every repo. The webhook secrets are per project, created by `ideaplaces-devops/discord/setup-cicd-notifications.sh`.

## Inputs

| Input | Required | What it does |
|-------|----------|--------------|
| `webhook` | yes | Discord webhook URL of the channel. Empty means the step does nothing. |
| `bot-token` | no | Token of a bot in the same server. It reads the channel so earlier failures can be found. Without it failures post but never clear. |
| `status` | yes | `success`, `failure`, `cancelled` or `skipped`. Usually `${{ job.status }}`. |
| `title` | yes | Title of the failure embed. The `:x:` prefix is added. |
| `description` | no | Body of the embed. Default: commit line, branch, actor. |
| `footer` | no | Footer text, for example `production | tourcockpit.com`. |
| `mention` | no | Message text above the embed on failure, for example `<@USER_ID>`. Mentions are what make Discord notify someone whose server setting is "only @mentions". |
| `key` | no | What a green run clears. Default `<workflow file>/<job id>@<branch>`. |

## How it works

- On `failure` the action posts one red embed through the webhook. The embed links to the run, and the link carries a fragment, `#ci-status=<key>`, that GitHub ignores and Discord does not show. The key is `ci.yml/verify@feature/x`: workflow file, job id, branch. On a pull request the branch is the PR head, not `123/merge`.
- On `success` the action asks the webhook for its channel, reads the channel with the bot token, and deletes every message that this webhook posted and that carries this key. Other embeds, other keys, other webhooks and human messages are never touched. Deletion goes through the webhook itself, which can only delete its own messages.
- On `cancelled` or `skipped` nothing happens.
- Discord rate limits are honoured (429 with `retry_after`). Any other Discord error is logged as a workflow warning and the step exits 0. A notification never turns a green build red, and never hides a red build behind a second failure.

No dependencies, no build step. Node 20, `fetch`, one file per concern under `src/`.

## Development

```bash
npm test
```

The unit tests cover the key derivation, the payload, the message selection, the 429 retry and the orchestration with a fake client. The repo's own CI also runs the action against itself (`uses: ./`) on every push, which is the live smoke test: a real webhook, a real channel.

To try it by hand against a scratch channel, export the `GITHUB_*` variables a runner would set, pass the inputs as `INPUT_<NAME>` variables and run `node src/index.js`. Bash cannot export a name with a hyphen, so the bot token goes in through `env "INPUT_BOT-TOKEN=..."`.

## Releases

Tags. `v1` moves to the newest `v1.x.y`; workflows pin `@v1`.

```bash
git tag -a v1.0.1 -m "..." && git tag -f v1 v1.0.1 && git push origin v1.0.1 && git push -f origin v1
```
