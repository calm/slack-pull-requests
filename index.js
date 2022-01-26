"use strict";
const core = require("@actions/core");
const github = require("@actions/github");

// Requirements outside of Github Actions
const okta = require("@okta/okta-sdk-nodejs");
const { WebClient } = require("@slack/web-api");
const { Octokit } = require("@octokit/rest");
const { createActionAuth } = require("@octokit/auth-action");

const oktaClient = new okta.Client();
const githubFieldName = process.env.GITHUB_FIELD_NAME;

const token = process.env.SLACK_BOT_TOKEN;
const slack = new WebClient(token);

const ellipsize = function (text, maxLen) {
  if (text.length <= maxLen) {
    return text;
  }
  const ellipsis = "...";
  return text.slice(0, maxLen - ellipsis.length) + ellipsis;
};

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
          text: ellipsize(pr.title, 75),
        },
        url: pr.url,
      },
    },
  ];
};

const slackMessageTemplateReviewedPR = function (reviewUser, pr) {
  const verb =
    {
      approved: "has approved",
      request_changes: "has requested changes on",
      commented: "has commented on",
    }[pr.state] || "has commented on";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${reviewUser} ${verb} your PR "${pr.title}": `,
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
          text: ellipsize(pr.title, 75),
        },
        url: pr.url,
      },
    },
  ];
};

const sendSlackMessage = async function (message, to) {
  const response = await slack.chat.postMessage({
    channel: to,
    blocks: message,
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

const getSlackNameByGithub = async function (ghHandle) {
  try {
    const slackName = await getOktaUser(ghHandle)
      .then(getUserEmailByGithub)
      .then(getSlackNameByEmail);
    return slackName;
  } catch (err) {
    return handle;
  }
};

const getSlackIdByGithub = async function (ghHandle) {
  const slackId = await getOktaUser(ghHandle)
    .then(getUserEmailByGithub)
    .then(getSlackIdByEmail);
  return slackId;
};

let _octokit;
const getOctokit = async function () {
  if (!_octokit) {
    const auth = createActionAuth();
    const ghAuthentication = await auth();
    _octokit = new Octokit({
      authStrategy: createActionAuth,
      auth: ghAuthentication,
    });
  }
  return _octokit;
};

const getGithubHandlesForTeam = async function (org, team_slug) {
  const octokit = await getOctokit();
  const members = await octokit.teams.listMembersInOrg({
    org,
    team_slug,
  });
  return members.data;
};

const handleReviewRequested = async function (payload) {
  let pullRequestData;
  try {
    pullRequestData = {
      title: payload.pull_request.title,
      url: payload.pull_request.html_url,
      org: payload.organization.login,
      requester: payload.pull_request.user.login,
    };
    if (payload.requested_team) {
      const teamMembers = await getGithubHandlesForTeam(
        payload.organization.login,
        payload.requested_team.slug
      );
      pullRequestData.reviewers = teamMembers
        .map((teamMember) => teamMember.login)
        .filter((login) => login !== payload.pull_request.user.login);
    } else {
      pullRequestData.reviewers = [payload.requested_reviewer.login];
    }
  } catch (err) {
    console.log("Unable to construct pullRequestData for payload", payload);
    core.setFailed(err.message);
    return;
  }
  console.log("pullRequestData", pullRequestData);

  try {
    const requestUser = await getSlackNameByGithub(pullRequestData.requester);
    const results = await Promise.allSettled(
      pullRequestData.reviewers.map(async (reviewer) => {
        const reviewUser = await getSlackIdByGithub(reviewer);
        const res = await sendSlackMessage(
          slackMessageTemplateNewPR(requestUser, pullRequestData),
          reviewUser
        );
        console.log(
          "Message sent about",
          requestUser,
          "to",
          reviewUser,
          res.ts
        );
      })
    );
    const failureReasons = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (failureReasons.length) {
      console.log("Failed to message", failureReasons.length, "users");
      throw failureReasons[0];
    }
  } catch (err) {
    core.setFailed(err.message);
  }
};

const handleReviewSubmitted = async function (payload) {
  let pullRequestData;
  try {
    pullRequestData = {
      title: payload.pull_request.title,
      url: payload.pull_request.html_url,
      org: payload.organization.login,
      pr_owner: payload.pull_request.user.login,
      reviewer: payload.review.user.login,
      state: payload.review.state.toLowerCase(),
    };
  } catch (err) {
    console.log(
      "Unable to construct pullRequestData for payload with PR:",
      payload.pull_request,
      "and review",
      payload.review
    );
    core.setFailed(err.message);
    return;
  }
  console.log("pullRequestData", pullRequestData);

  if (pullRequestData.pr_owner === pullRequestData.reviewer) {
    return;
  }

  try {
    const reviewUser = await getSlackNameByGithub(pullRequestData.reviewer);
    const ownerUser = await getSlackIdByGithub(pullRequestData.pr_owner);
    const res = await sendSlackMessage(
      slackMessageTemplateReviewedPR(reviewUser, pullRequestData),
      ownerUser
    );
    console.log(
      "Message sent about review by",
      reviewUser,
      "to",
      ownerUser,
      res.ts
    );
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
    handleReviewRequested(context.payload);
  } else if (
    context.eventName === "pull_request_review" &&
    context.payload.action === "submitted"
  ) {
    handleReviewSubmitted(context.payload);
  }
};

main(github.context);
