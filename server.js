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
// De la gradul cel mai mare la cel mai mic
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
// CAUTĂ CEL MAI MARE GRAD
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
            "diicot-change-this-secret"
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
// STATIC FILES
// ======================================================

app.use(express.static(__dirname));


// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );

});


// ======================================================
// DISCORD LOGIN
// ======================================================

app.get("/auth/discord", (req, res) => {

    if (
        !CLIENT_ID ||
        !CLIENT_SECRET ||
        !REDIRECT_URI ||
        !GUILD_ID
    ) {

        console.error(
            "LIPSESC VARIABILELE DISCORD DIN RENDER!"
        );

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


    const discordURL =
        "https://discord.com/oauth2/authorize?" +
        params.toString();


    return res.redirect(
        discordURL
    );

});


// ======================================================
// DISCORD CALLBACK
// ======================================================

app.get(
    "/auth/discord/callback",

    async (req, res) => {

        const code =
            req.query.code;

        const state =
            req.query.state;


        // ------------------------------------------
        // VERIFICARE CODE
        // ------------------------------------------

        if (!code) {

            console.log(
                "Discord callback fără CODE."
            );

            return res.redirect(
                "/?error=no_code"
            );

        }


        // ------------------------------------------
        // VERIFICARE STATE
        // ------------------------------------------

        if (
            !state ||
            !req.session.oauthState ||
            state !== req.session.oauthState
        ) {

            console.log(
                "OAuth STATE invalid."
            );

            return res.redirect(
                "/?error=invalid_state"
            );

        }


        delete req.session.oauthState;


        try {

            // ==================================================
            // TOKEN DISCORD
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
            // DATE UTILIZATOR
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
            // VERIFICARE SERVER + ROLURI
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

            }

            catch (memberError) {

                console.error(
                    "================================"
                );

                console.error(
                    "EROARE VERIFICARE SERVER"
                );

                console.error(
                    "USER:",
                    discordUser.username
                );

                console.error(
                    "GUILD ID:",
                    GUILD_ID
                );

                console.error(
                    "DISCORD:",
                    memberError.response?.data ||
                    memberError.message
                );

                console.error(
                    "================================"
                );


                return res.redirect(
                    "/?error=not_member"
                );

            }


            // ==================================================
            // ROLE IDS
            // ==================================================

            const roles =
                Array.isArray(member.roles)
                    ? member.roles.map(String)
                    : [];


            // ==================================================
            // DEBUG IMPORTANT
            // ==================================================

            console.log("");
            console.log(
                "========================================"
            );

            console.log(
                "        DIICOT DISCORD DEBUG"
            );

            console.log(
                "========================================"
            );

            console.log(
                "USER:",
                discordUser.username
            );

            console.log(
                "USER ID:",
                discordUser.id
            );

            console.log(
                "GUILD ID FOLOSIT:",
                GUILD_ID
            );

            console.log(
                "NICKNAME:",
                member.nick || "Fără nickname"
            );

            console.log(
                "NUMĂR ROLURI:",
                roles.length
            );

            console.log(
                "ROLE IDS PRIMITE:"
            );

            console.log(
                JSON.stringify(
                    roles,
                    null,
                    2
                )
            );


            console.log(
                "----------------------------------------"
            );

            console.log(
                "ROLE IDS CONFIGURATE PE SITE:"
            );

            console.log(
                JSON.stringify(
                    DIICOT_ROLES.map(role => ({
                        name: role.name,
                        id: role.id
                    })),
                    null,
                    2
                )
            );


            // ==================================================
            // DETECTARE GRAD
            // ==================================================

            const diicotRole =
                getHighestDIICOTRole(
                    roles
                );


            console.log(
                "----------------------------------------"
            );


            if (diicotRole) {

                console.log(
                    "GRAD DETECTAT:",
                    diicotRole.name
                );

                console.log(
                    "ROLE ID:",
                    diicotRole.id
                );

            }

            else {

                console.log(
                    "GRAD DETECTAT: FĂRĂ GRAD"
                );

                console.log(
                    "Niciun ROLE ID primit nu se potrivește cu lista DIICOT."
                );

            }


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


            return res.redirect("/");

        }

        catch (error) {

            console.error("");
            console.error(
                "========================================"
            );

            console.error(
                "DISCORD OAUTH ERROR"
            );

            console.error(
                error.response?.data ||
                error.message
            );

            console.error(
                "========================================"
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

app.get(
    "/api/me",

    (req, res) => {

        if (
            !req.session ||
            !req.session.user
        ) {

            return res
                .status(401)
                .json({

                    loggedIn:
                        false

                });

        }


        return res.json({

            loggedIn:
                true,

            user:
                req.session.user

        });

    }
);


// ======================================================
// LOGOUT
// ======================================================

app.get(
    "/logout",

    (req, res) => {

        req.session = null;

        return res.redirect("/");

    }
);


// ======================================================
// HEALTH CHECK
// ======================================================

app.get(
    "/health",

    (req, res) => {

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

    }
);


// ======================================================
// 404
// ======================================================

app.use(
    (req, res) => {

        console.log(
            "404:",
            req.method,
            req.originalUrl
        );


        return res
            .status(404)
            .send(
                "Pagina nu a fost găsită."
            );

    }
);


// ======================================================
// START SERVER
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
            "GUILD ID:",
            GUILD_ID || "LIPSEȘTE"
        );

        console.log(
            "GRADE CONFIGURATE:",
            DIICOT_ROLES.length
        );

        console.log(
            "========================================"
        );

        console.log("");

    }
);
