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

// ================================
// CONFIGURARE EXPRESS
// ================================

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    cookieSession({
        name: "diicot_session",
        keys: [
            process.env.SESSION_SECRET || "diicot-secret"
        ],
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
    })
);

// Fișierele tale sunt direct în rădăcina repo-ului
app.use(express.static(__dirname));


// ================================
// HOMEPAGE
// ================================

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "index.html")
    );
});


// ================================
// LOGIN DISCORD
// ================================

app.get("/auth/discord", (req, res) => {

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {

        console.error(
            "Lipsesc variabile Discord din Render."
        );

        return res.status(500).send(
            "Configurarea Discord nu este completă."
        );
    }

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "identify guilds guilds.members.read"
    });

    const discordLoginURL =
        "https://discord.com/oauth2/authorize?" +
        params.toString();

    res.redirect(discordLoginURL);
});


// ================================
// CALLBACK DISCORD
// ================================

app.get(
    "/auth/discord/callback",
    async (req, res) => {

        const code = req.query.code;

        if (!code) {

            console.log(
                "Callback fără authorization code."
            );

            return res.redirect(
                "/?error=no_code"
            );
        }

        try {

            // ------------------------
            // ACCESS TOKEN
            // ------------------------

            const tokenParams =
                new URLSearchParams();

            tokenParams.append(
                "client_id",
                CLIENT_ID
            );

            tokenParams.append(
                "client_secret",
                CLIENT_SECRET
            );

            tokenParams.append(
                "grant_type",
                "authorization_code"
            );

            tokenParams.append(
                "code",
                code
            );

            tokenParams.append(
                "redirect_uri",
                REDIRECT_URI
            );


            const tokenResponse =
                await axios.post(
                    "https://discord.com/api/oauth2/token",
                    tokenParams.toString(),
                    {
                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded"
                        }
                    }
                );


            const accessToken =
                tokenResponse.data.access_token;


            // ------------------------
            // USER DISCORD
            // ------------------------

            const userResponse =
                await axios.get(
                    "https://discord.com/api/users/@me",
                    {
                        headers: {
                            Authorization:
                                `Bearer ${accessToken}`
                        }
                    }
                );


            const discordUser =
                userResponse.data;


            // ------------------------
            // MEMBER SERVER
            // ------------------------

            let member;

            try {

                const memberResponse =
                    await axios.get(
                        `https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`,
                        {
                            headers: {
                                Authorization:
                                    `Bearer ${accessToken}`
                            }
                        }
                    );

                member =
                    memberResponse.data;

            } catch (memberError) {

                console.error(
                    "Nu s-a putut verifica membrul:",
                    memberError.response?.data ||
                    memberError.message
                );

                return res.redirect(
                    "/?error=not_member"
                );
            }


            // ------------------------
            // SALVARE SESIUNE
            // ------------------------

            req.session.user = {

                id:
                    discordUser.id,

                username:
                    discordUser.username,

                globalName:
                    discordUser.global_name ||
                    discordUser.username,

                avatar:
                    discordUser.avatar,

                roles:
                    member.roles || [],

                guildId:
                    GUILD_ID

            };


            console.log(
                `Login reușit: ${discordUser.username}`
            );


            // Înapoi pe homepage
            return res.redirect("/");

        } catch (error) {

            console.error(
                "Discord OAuth Error:",
                error.response?.data ||
                error.message
            );

            return res.redirect(
                "/?error=discord"
            );
        }
    }
);


// ================================
// USER LOGAT
// ================================

app.get("/api/me", (req, res) => {

    if (
        !req.session ||
        !req.session.user
    ) {

        return res.status(401).json({
            loggedIn: false
        });
    }


    return res.json({

        loggedIn: true,

        user: req.session.user

    });
});


// ================================
// LOGOUT
// ================================

app.get("/logout", (req, res) => {

    req.session = null;

    res.redirect("/");
});


// ================================
// HEALTH CHECK
// ================================

app.get("/health", (req, res) => {

    res.json({
        status: "online",
        service: "DIICOT Hub"
    });
});


// ================================
// 404
// ================================

app.use((req, res) => {

    console.log(
        "404:",
        req.method,
        req.originalUrl
    );

    res.status(404).send(
        "Pagina nu a fost găsită."
    );
});


// ================================
// START
// ================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "=============================="
        );

        console.log(
            "DIICOT HUB ONLINE"
        );

        console.log(
            `PORT: ${PORT}`
        );

        console.log(
            `CALLBACK: ${REDIRECT_URI}`
        );

        console.log(
            "=============================="
        );
    }
);
