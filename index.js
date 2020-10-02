"use strict";
const core = require("@actions/core");
const github = require("@actions/github");

// Requirements outside of Github Actions
const okta = require("@okta/okta-sdk-nodejs");
const { WebClient } = require("@slack/web-api");

const oktaClient = new okta.Client();

const token = process.env.SLACK_BOT_TOKEN;
const web = new WebClient(token);

let slackMessageTemplate = function (requestUser) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `@${requestUser} has requested a review on the following Pull Request: `,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: pullRequestData.url,
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: pullRequestData.title,
        },
        url: pullRequestData.url,
      },
    },
  ];
};

let getOktaUser = function (handle) {
  return oktaClient
    .listUsers({
      search: `profile.github_user eq "@${handle}"`,
      limit: 1,
    })
    .next();
};

let getUserEmailByGithub = function (oktaUser) {
  return Promise.resolve(oktaUser.value.profile.email);
};

let getSlackIdByEmail = function (email) {
  return web.users.lookupByEmail({ email: email }).then((r) => r.user.id);
};

let getSlackNameByEmail = function (email) {
  return web.users.lookupByEmail({ email: email }).then((r) => r.user.name);
};

let sendSlackMessage = function (reviewUser, requestUser) {
  return web.chat.postMessage({
    channel: String(reviewUser),
    blocks: slackMessageTemplate(requestUser),
  });
};

let payload = github.context.payload;

const pullRequestData = Object.create({
  title: payload.pull_request.title,
  url: payload.pull_request.html_url,
  reviewer: payload.requested_reviewer.login,
  requester: payload.pull_request.user.login,
});

let requesterPromise = getOktaUser(pullRequestData.requester)
  .then(getUserEmailByGithub)
  .then(getSlackNameByEmail);
let reviewerPromise = getOktaUser(pullRequestData.reviewer)
  .then(getUserEmailByGithub)
  .then(getSlackIdByEmail);

Promise.all([requesterPromise, reviewerPromise])
  .then((users) => {
    let requestUser = users[0];
    let reviewUser = users[1];

    sendSlackMessage(reviewUser, requestUser).then((res) =>
      console.log("Message sent: ", res.ts)
    );
  })
  .catch(function (err) {
    core.setFailed(err.message);
  });
