import DiscordJS, { GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
import request from "request";
import express from "express";
import requestPromise from "request-promise-native";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const client = new DiscordJS.Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const DiscordAuth = process.env.DISCORD_AUTH;
client.login(DiscordAuth);

const client_id = "45efa30ebf2047eaa6f5ac88ddcc5fa9";
const client_secret = "ed44f327fe99454ea7bbfb4666bdd934";
const redirect_uri = "http://localhost:3000/callback";
let token = "";
let refreshToken = "";
let tokenExpiresAt = 0;

//Waits for GET from spotify
app.get("/callback", (req, res) => {
  const code = req.query.code || null;

  const authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code: code,
      redirect_uri: redirect_uri,
      grant_type: "authorization_code",
    },
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(client_id + ":" + client_secret).toString("base64"),
    },
    json: true,
  };

  request.post(authOptions, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      token = body.access_token;
      refreshToken = body.refresh_token;
      res.send("You can now close this tab and return to the Discord bot.");
    } else {
      //console.error("Error occurred while authenticating:", body);
      res.send("Error occurred while authenticating.");
    }
  });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

function generateSpotifyAuthUrl() {
  const baseUrl = "https://accounts.spotify.com/authorize";
  const scope = "playlist-modify-private";
  const state = "some-random-string"; // Optional, but recommended for CSRF protection

  return `${baseUrl}?client_id=${client_id}&response_type=code&redirect_uri=${encodeURIComponent(
    redirect_uri
  )}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
}
generateSpotifyAuthUrl();
console.log("Spotify authorization URL:", generateSpotifyAuthUrl());

async function refreshAccessToken() {
  if (!refreshToken) {
    console.log("Refresh token not set yet. Skipping access token refresh.");
    return;
  }

  const authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(client_id + ":" + client_secret).toString("base64"),
    },
    json: true,
  };

  try {
    const body = await requestPromise.post(authOptions);
    if (body.access_token) {
      token = body.access_token;
      console.log("Access token refreshed");
    } else {
      console.log("Error occurred while refreshing access token");
    }
  } catch (error) {
    console.error("Error occurred while refreshing access token:", error);
  }
}
setInterval(refreshAccessToken, 45 * 60 * 1000);

async function refreshAccessTokenIfNeeded() {
  const remainingTime = tokenExpiresAt - new Date().getTime();
  if (remainingTime < 5 * 60 * 1000) {
    // Refresh the token if it has less than 5 minutes remaining
    await refreshAccessToken();
  }
}

console.log("access token being used:", token);

client.on("messageCreate", async (message) => {
  if (message.content.startsWith("https://open.spotify")) {
    await refreshAccessTokenIfNeeded();
    let urlInp = message.content;
    let uri = urlInp.match(/track\/(\w{22})/)[1];

    let newTrack = "spotify:track:" + uri;
    let callAPI = () => {
      fetch(
        "https://api.spotify.com/v1/playlists/0hEHnMN8ubSHETiKzKv5ME/tracks",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: [newTrack] }),
        }
      )
        .then((response) => {
          if (!response.ok) {
            return response.text().then((text) => {
              throw new Error(`HTTP error ${response.status}: ${text}`);
            });
          }
          return response.json();
        })
        .then((data) => {
          console.log("API called successfully");
          // Handle successful response data here if needed
        })
        .catch((error) => {
          console.error("Error occurred while making request:", error.message);
          console.error(
            "Error response body:",
            error.response ? error.response.body : "No response body"
          );
        });
    };

    callAPI();
    console.log("api called");
    console.log(token);
  }
});

client.on("ready", readyDiscord);
function readyDiscord() {
  console.log("Bot is online");
}
