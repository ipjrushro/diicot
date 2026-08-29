const express = require("express");
const axios = require("axios");
const cookieSession = require("cookie-session");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GUILD_ID = process.env.DISCORD_GUILD_ID;


// ======================================================
// GRADE DIICOT
// ======================================================

const DIICOT_ROLES = [

    {
        id: "1441514560900169785",
        name: "PROCUROR ȘEF",
        level: 13
    },

    {
        id: "1441514560900169784",
        name: "PROCUROR ȘEF ADJUNCT",
        level: 12
    },

    {
        id: "1441514560900169783",
        name: "PROCUROR",
        level: 11
    },

    {
        id: "1441514560900169782",
        name: "COORDONATOR",
        level: 10
    },

    {
        id: "1441514560900169781",
        name: "COMISAR ȘEF",
        level: 9
    },

    {
        id: "1441514560900169779",
        name: "COMISAR",
        level: 8
    },

    {
        id: "1441514560900169778",
        name: "SUB COMISAR",
        level: 7
    },

    {
        id: "1441514560891650098",
        name: "INSPECTOR PRINCIPAL",
        level: 6
    },

    {
        id: "1441514560891650097",
        name: "INSPECTOR",
        level: 5
    },

    {
        id: "1441514560891650095",
        name: "SUB INSPECTOR",
        level: 4
    },

    {
        id: "1441514560875135229",
        name: "AGENT PRINCIPAL",
        level: 3
    },

    {
        id: "1441514560875135228",
        name: "AGENT OPERATIV",
        level: 2
    },

    {
        id: "1441514560875135227",
        name: "AGENT STAGIAR",
        level: 1
    }

];


// ======================================================
// DETECTARE GRAD
// ======================================================

function getHighestDIICOTRole(userRoles = []) {

    for (const role of DIICOT_ROLES) {

        if (userRoles.includes(role.id)) {
            return role;
        }
    }

    return null;
}


// ======================================================
// EXPRESS
// ======================================================

app.set("trust proxy", 1);

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


// ======================================================
// SESSION
// ======================================================

app.use(
    cookieSession({

        name: "diicot_session",

        keys: [
            process.env.SESSION_SECRET ||
            "change-this-secret"
        ],

        maxAge:
            24 *
            60 *
            60 *
            1000,

        httpOnly: true,

        sameSite: "lax",

        secure:
            process.env.NODE_ENV === "production"

    })
);


// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {

    return res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );

});


// ======================================================
// DASHBOARD PROTEJAT
// ======================================================

app.get("/dashboard", (req, res) => {

    if (
        !req.session ||
        !req.session.user
    ) {

        return res.redirect("/");
    }

    return res.sendFile(
        path.join(
            __dirname,
            "dashboard.html"
        )
    );

});


// ======================================================
// STATIC FILES
// ======================================================

app.use(
    express.static(
        __dirname,
        {
            index: false
        }
    )
);


// ======================================================
// LOGIN DISCORD
// ======================================================

app.get("/auth/discord", (req, res) => {

    if (
        !CLIENT_ID ||
        !CLIENT_SECRET ||
        !REDIRECT_URI ||
        !GUILD_ID
    ) {

        return res
            .status(500)
            .send(
                "Configurarea Discord nu este completă."
            );
    }

    const state =
        crypto
            .randomBytes(24)
            .toString("hex");

    req.session.oauthState =
        state;

    const params =
        new URLSearchParams({

            client_id:
                CLIENT_ID,

            redirect_uri:
                REDIRECT_URI,

            response_type:
                "code",

            scope:
                "identify guilds guilds.members.read",

            state:
                state

        });

    return res.redirect(
        "https://discord.com/oauth2/authorize?" +
        params.toString()
    );

});


// ======================================================
// CALLBACK DISCORD
// ======================================================

app.get(
    "/auth/discord/callback",

    async (req, res) => {

        const code =
            req.query.code;

        const state =
            req.query.state;

        if (!code) {
            return res.redirect(
                "/?error=no_code"
            );
        }

        if (
            !state ||
            !req.session.oauthState ||
            state !== req.session.oauthState
        ) {

            return res.redirect(
                "/?error=invalid_state"
            );
        }

        delete req.session.oauthState;

        try {

            // ==================================================
            // TOKEN
            // ==================================================

            const tokenParams =
                new URLSearchParams({

                    client_id:
                        CLIENT_ID,

                    client_secret:
                        CLIENT_SECRET,

                    grant_type:
                        "authorization_code",

                    code:
                        code,

                    redirect_uri:
                        REDIRECT_URI

                });

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


            // ==================================================
            // USER
            // ==================================================

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


            // ==================================================
            // MEMBER SERVER
            // ==================================================

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
                    "Eroare member:",
                    memberError.response?.data ||
                    memberError.message
                );

                return res.redirect(
                    "/?error=not_member"
                );
            }


            // ==================================================
            // ROLURI
            // ==================================================

            const roles =
                Array.isArray(member.roles)
                    ? member.roles.map(String)
                    : [];

            const diicotRole =
                getHighestDIICOTRole(roles);


            // ==================================================
            // LOG
            // ==================================================

            console.log("");
            console.log(
                "========================================"
            );

            console.log(
                "DIICOT LOGIN"
            );

            console.log(
                "USER:",
                discordUser.username
            );

            console.log(
                "ROLE IDS:",
                roles
            );

            console.log(
                "GRAD:",
                diicotRole
                    ? diicotRole.name
                    : "FĂRĂ GRAD"
            );

            console.log(
                "========================================"
            );

            console.log("");


            // ==================================================
            // SESSION
            // ==================================================

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
                    roles,

                rank:
                    diicotRole
                        ? diicotRole.name
                        : "MEMBRU DIICOT",

                rankLevel:
                    diicotRole
                        ? diicotRole.level
                        : 0,

                rankRoleId:
                    diicotRole
                        ? diicotRole.id
                        : null,

                guildId:
                    GUILD_ID

            };


            // IMPORTANT:
            // DUPĂ LOGIN REVINE PE HOMEPAGE
            // NU INTRĂ AUTOMAT ÎN DASHBOARD

            return res.redirect("/");

        }

        catch (error) {

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


// ======================================================
// API USER
// ======================================================

app.get("/api/me", (req, res) => {

    if (
        !req.session ||
        !req.session.user
    ) {

        return res
            .status(401)
            .json({
                loggedIn: false
            });
    }

    return res.json({

        loggedIn:
            true,

        user:
            req.session.user

    });

});


// ======================================================
// LOGOUT
// ======================================================

app.get("/logout", (req, res) => {

    req.session = null;

    res.clearCookie(
        "diicot_session",
        {
            httpOnly: true,
            sameSite: "lax",
            secure:
                process.env.NODE_ENV === "production"
        }
    );

    return res.redirect("/");

});


// ======================================================
// HEALTH
// ======================================================

app.get("/health", (req, res) => {

    return res.json({

        status:
            "online",

        service:
            "DIICOT Hub",

        guildConfigured:
            Boolean(GUILD_ID),

        rolesConfigured:
            DIICOT_ROLES.length

    });

});


// ======================================================
// 404
// ======================================================

app.use((req, res) => {

    return res
        .status(404)
        .send(
            "Pagina nu a fost găsită."
        );

});


// ======================================================
// START
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",

    () => {

        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "DIICOT HUB ONLINE"
        );

        console.log(
            "PORT:",
            PORT
        );

        console.log(
            "DASHBOARD:",
            "/dashboard"
        );

        console.log(
            "========================================"
        );

        console.log("");

    }
);
