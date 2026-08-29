const express = require("express");
const axios = require("axios");
const cookieSession = require("cookie-session");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

app.use(
  cookieSession({
    name: "diicot_session",
    keys: [process.env.SESSION_SECRET || "change-this-secret"],
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.get("/auth/discord", (req, res) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: "identify guilds guilds.members.read"
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.redirect("/?error=no_code");
  }

  try {
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    let member = null;

    try {
      const memberResponse = await axios.get(
        `https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      member = memberResponse.data;
    } catch {
      member = null;
    }

    if (!member) {
      return res.redirect("/?error=not_member");
    }

    req.session.user = {
      id: userResponse.data.id,
      username: userResponse.data.username,
      globalName: userResponse.data.global_name,
      avatar: userResponse.data.avatar,
      roles: member.roles || []
    };

    res.redirect("/dashboard.html");
  } catch (error) {
    console.error(
      "Discord OAuth error:",
      error.response?.data || error.message
    );

    res.redirect("/?error=discord");
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({
      loggedIn: false
    });
  }

  res.json({
    loggedIn: true,
    user: req.session.user
  });
});

app.get("/logout", (req, res) => {
  req.session = null;
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`DIICOT Hub pornit pe portul ${PORT}`);
});
