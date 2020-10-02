# Slack Pull Requests

## Required Environment Variables
(`.env.example` is included as alternative reference)

### Secret
- `OKTA_CLIENT_ORGURL` - The Okta URL used by your organization
- `OKTA_CLIENT_TOKEN` - An OKTA API token used for auth
- `SLACK_BOT_TOKEN` - An App/Bot token used for Slack operations

### Plain Text
- `GITHUB_FIELD_NAME` - The programmatic name of the field in Okta that stores a user's github handle

## Required Slack OAuth Scopes

- `chat:write` - Deliver DMs
- `users:read` - Identify Slack users
- `users:read.email` - Match Slack users to their Okta Email address

## Required Okta Profile Fields

- `github_user` - The Github handle of the Okta user, must include `@` in the value
