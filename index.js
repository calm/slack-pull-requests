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

const sendSlackMessage = async function (reviewUser, requestUser, pr) {
  const response = await slack.chat.postMessage({
    channel: String(reviewUser),
    blocks: slackMessageTemplateNewPR(requestUser, pr),
  });
  return response;
};

const getOktaUser = async function (handle) {
  const search = `(profile.${githubFieldName} eq "@${handle}") or (profile.${githubFieldName} eq "${handle}")`;
  console.log("Searching okta", search);
  const result = await oktaClient.listUsers({ search, limit: 1 }).next();
  console.log("Found oktaUser", result);
  return result;
};

const getUserEmailByGithub = function (oktaUser) {
  return oktaUser.value.profile.email;
};

const getSlackIdByEmail = async function (email) {
  const result = await slack.users.lookupByEmail({ email: email });
  console.log("Using email", email, "found slack user", result);
  return result.user.id;
};

const getSlackNameByEmail = async function (email) {
  const result = await slack.users.lookupByEmail({ email: email });
  console.log("Using email", email, "found slack user", result);
  return result.user.name;
};

const getSlackNameByGithub = async function (github) {
  try {
    const slackName = await getOktaUser(github)
      .then(getUserEmailByGithub)
      .then(getSlackNameByEmail);
    return slackName;
  } catch (err) {
    return github;
  }
};

const getSlackIdByGithub = async function (github) {
  const slackId = await getOktaUser(github)
    .then(getUserEmailByGithub)
    .then(getSlackIdByEmail);
  return slackId;
};

const handleReviewRequested = async function (context) {
  let pullRequestData;
  try {
    pullRequestData = {
      title: context.payload.pull_request.title,
      url: context.payload.pull_request.html_url,
      reviewer: context.payload.requested_reviewer.login,
      requester: context.payload.pull_request.user.login,
    };
  } catch (err) {
    console.log(
      "Unable to construct pullRequestData for payload with PR:",
      context.payload.pull_request,
      'and requested reviewer',
      context.payload.requested_reviewer,
      'and requested reviewers',
      context.payload.requested_reviewers,
    );
    core.setFailed(err.message);
    return;
  }
  console.log("pullRequestData", pullRequestData);

  try {
    const requestUser = await getSlackNameByGithub(pullRequestData.requester);
    const reviewUser = await getSlackIdByGithub(pullRequestData.reviewer);
    const res = await sendSlackMessage(
      reviewUser,
      requestUser,
      pullRequestData
    );
    console.log("Message sent about", requestUser, "to", reviewUser, res.ts);
  } catch (err) {
    core.setFailed(err.message);
  }
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
