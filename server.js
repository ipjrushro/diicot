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

// ==============================
// SESSION
// ==============================

app.use(
  cookieSession({
    name: "diicot_session",
    keys: [process.env.SESSION_SECRET || "diicot-session-secret"],
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  })
);

// ==============================
// STATIC FILES
// ==============================

// index.html, style.css etc. sunt în rădăcina proiectului
app.use(express.static(__dirname));

// ==============================
// HOME PAGE
// ==============================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ==============================
// DISCORD LOGIN
// ==============================

app.get("/auth/discord", (req, res) => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).send(
      "Discord OAuth nu este configurat corect în Environment Variables."
    );
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: "identify guilds guilds.members.read"
  });

  const discordURL =
    `https://discord.com/oauth2/authorize?${params.toString()}`;

  res.redirect(discordURL);
});

// ==============================
// DISCORD CALLBACK
// ==============================

app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.redirect("/?error=no_code");
  }

  try {
    // Obținem access token-ul de la Discord
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // ==============================
    // USER INFO
    // ==============================

    const userResponse = await axios.get(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    // ==============================
    // SERVER MEMBER INFO
    // ==============================

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
    } catch (error) {
      console.log("Utilizatorul nu este membru sau nu poate fi verificat.");
    }

    if (!member) {
      return res.redirect("/?error=not_member");
    }

    // ==============================
    // SAVE USER SESSION
    // ==============================

    req.session.user = {
      id: userResponse.data.id,
      username: userResponse.data.username,
      globalName:
        userResponse.data.global_name ||
        userResponse.data.username,
      avatar: userResponse.data.avatar,
      roles: member.roles || []
    };

    // Pentru moment revenim pe homepage.
    // Mai târziu facem dashboard separat.
    res.redirect("/");

  } catch (error) {
    console.error(
      "Discord OAuth Error:",
      error.response?.data || error.message
    );

    res.redirect("/?error=discord");
  }
});

// ==============================
// CURRENT USER API
// ==============================

app.get("/api/me", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      loggedIn: false
    });
  }

  res.json({
    loggedIn: true,
    user: req.session.user
  });
});

// ==============================
// LOGOUT
// ==============================

app.get("/logout", (req, res) => {
  req.session = null;

  res.redirect("/");
});

// ==============================
// HEALTH CHECK
// ==============================

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "online"
  });
});

// ==============================
// START SERVER
// ==============================

app.listen(PORT, "0.0.0.0", () => {
  console.log("==============================");
  console.log("DIICOT HUB ONLINE");
  console.log(`Port: ${PORT}`);
  console.log("==============================");
});
