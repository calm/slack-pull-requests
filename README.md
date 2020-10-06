# Slack Pull Requests

## Usage

1. Set up your environment variables, Slack OAuth, and Okta profiles as detailed below
2. Drop the following file into your repo at path `.github/workflows/notify.yml` (editing `GITHUB_FIELD_NAME` as appropriate)

```
on: pull_request

jobs:
  pull_request_notifier:
    runs-on: ubuntu-latest
    name: Notify Requested Reviewers
    steps:
      - uses: actions/checkout@v2
      - name: Use Node.js
        uses: actions/setup-node@v1
        with:
          always-auth: true
          node-version: '12.x'
          registry-url: 'https://npm.pkg.github.com'
      - name: Notify
        env:
          OKTA_CLIENT_ORGURL: ${{ secrets.OKTA_CLIENT_ORGURL }}
          OKTA_CLIENT_TOKEN: ${{ secrets.OKTA_CLIENT_TOKEN }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
          GITHUB_FIELD_NAME: 'Github'
        uses: calm/slack-pull-requests@master
        id: notify
```

## Required Environment Variables

(`.env.example` is included as alternative reference)

## GitHub Secrets

See [here](https://docs.github.com/en/free-pro-team@latest/actions/reference/encrypted-secrets#creating-encrypted-secrets-for-a-repository) for instructions on adding secrets to your GitHub repository

- `OKTA_CLIENT_ORGURL` - The Okta URL used by your organization
- `OKTA_CLIENT_TOKEN` - An OKTA API token used for auth
- `SLACK_BOT_TOKEN` - An App/Bot token used for Slack operations

## Plain Text

- `GITHUB_FIELD_NAME` - The programmatic name of the field in Okta that stores a user's github handle. Edit it directly in `notify.yml`

## Required Slack OAuth Scopes

- `chat:write` - Deliver DMs
- `users:read` - Identify Slack users
- `users:read.email` - Match Slack users to their Okta Email address

## Required Okta Profile Fields

- `github_user` - The Github handle of the Okta user, must include `@` in the value
