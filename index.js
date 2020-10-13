"use strict";
const core = require("@actions/core");
const github = require("@actions/github");

// Requirements outside of Github Actions
const okta = require("@okta/okta-sdk-nodejs");
const { WebClient } = require("@slack/web-api");

const oktaClient = new okta.Client();
const githubFieldName = process.env.GITHUB_FIELD_NAME;

const token = process.env.SLACK_BOT_TOKEN;
const slack = new WebClient(token);

const prApprovalImg = "https://i.imgur.com/41zA3Ek.png";

const slackMessageTemplateNewPR = function (requestUser, pr) {
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
        text: pr.url,
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: pr.title,
        },
        url: pr.url,
      },
    },
  ];
};

const slackMessageTemplateApprovedPR = function (reviewUser, pr) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${reviewUser} has approved ${pr.title}: `,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: pr.url,
      },
      accessory: {
        type: "image",
        image_url: prApprovalImg,
        alt_text: "LGTM",
      },
    },
  ];
};

const sendSlackMessage = function (reviewUser, requestUser, pr) {
  return slack.chat.postMessage({
    channel: String(reviewUser),
    blocks: slackMessageTemplateNewPR(requestUser, pr),
  });
};

const getOktaUser = function (handle) {
  const search = `(profile.${githubFieldName} eq "@${handle}") or (profile.${githubFieldName} eq "${handle}")`;
  console.log("Searching okta", search);
  return oktaClient.listUsers({ search, limit: 1 }).next();
};

const getUserEmailByGithub = function (oktaUser) {
  console.log("Found oktaUser", oktaUser);
  return oktaUser.value.profile.email;
};

const getSlackIdByEmail = function (email) {
  return slack.users.lookupByEmail({ email: email }).then((r) => {
    console.log("Using email", email, "found slack user", r);
    return r.user.id;
  });
};

const getSlackNameByEmail = function (email) {
  return slack.users.lookupByEmail({ email: email }).then((r) => {
    console.log("Using email", email, "found slack user", r);
    return r.user.name;
  });
};

const handleReviewRequested = function (context) {
  const pullRequestData = {
    title: context.payload.pull_request.title,
    url: context.payload.pull_request.html_url,
    reviewer: context.payload.requested_reviewer.login,
    requester: context.payload.pull_request.user.login,
  };
  console.log("pullRequestData", pullRequestData);

  const requesterPromise = getOktaUser(pullRequestData.requester)
    .then(getUserEmailByGithub)
    .then(getSlackNameByEmail);
  const reviewerPromise = getOktaUser(pullRequestData.reviewer)
    .then(getUserEmailByGithub)
    .then(getSlackIdByEmail);

  Promise.all([requesterPromise, reviewerPromise])
    .then((users) => {
      const requestUser = users[0];
      const reviewUser = users[1];

      sendSlackMessage(reviewUser, requestUser, pullRequestData).then((res) =>
        console.log("Message sent about", requestUser, "to", reviewUser, res.ts)
      );
    })
    .catch(function (err) {
      core.setFailed(err.message);
    });
};

const main = function (context) {
  console.log("Event received", context.eventName, context.payload.action);
  if (
    context.eventName === "pull_request" &&
    context.payload.action === "review_requested"
  ) {
    handleReviewRequested(context);
  }
};

main(github.context);
