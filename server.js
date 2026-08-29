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
// Ordinea este de la cel mai mare la cel mai mic.
// Dacă un utilizator are mai multe roluri, îl ia pe cel
// mai mare din această listă.
// ======================================================

const DIICOT_ROLES = [

    {
        id: "1528758226420633746",
        name: "PROCUROR ȘEF",
        level: 13
    },

    {
        id: "1528758226420633745",
        name: "PROCUROR ȘEF ADJUNCT",
        level: 12
    },

    {
        id: "1528758226420633744",
        name: "PROCUROR",
        level: 11
    },

    {
        id: "1528758226416435219",
        name: "COORDONATOR",
        level: 10
    },

    {
        id: "1528758226416435217",
        name: "COMISAR ȘEF",
        level: 9
    },

    {
        id: "1528758226416435216",
        name: "COMISAR",
        level: 8
    },

    {
        id: "1528758226416435215",
        name: "SUB COMISAR",
        level: 7
    },

    {
        id: "1528758226416435214",
        name: "INSPECTOR PRINCIPAL",
        level: 6
    },

    {
        id: "1528758226416435213",
        name: "INSPECTOR",
        level: 5
    },

    {
        id: "1528758226416435211",
        name: "SUB INSPECTOR",
        level: 4
    },

    {
        id: "1528758226416435210",
        name: "AGENT PRINCIPAL",
        level: 3
    },

    {
        id: "1528758226407919645",
        name: "AGENT OPERATIV",
        level: 2
    },

    {
        id: "1528758226407919644",
        name: "AGENT STAGIAR",
        level: 1
    }

];


// ======================================================
// FUNCȚIE GRAD
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
// EXPRESS CONFIG
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
            "change-this-session-secret"
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

        return res.status(500).send(
            "Configurarea Discord nu este completă."
        );

    }


    // State pentru protecția autentificării
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


    res.redirect(
        "https://discord.com/oauth2/authorize?" +
        params.toString()
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
            // ACCESS TOKEN
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
            // DISCORD USER
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
            // MEMBER INFO
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

            catch (error) {

                console.log(
                    "Utilizatorul nu este membru pe server."
                );


                return res.redirect(
                    "/?error=not_member"
                );

            }


            const roles =
                member.roles || [];


            // ==================================================
            // DETECTARE GRAD
            // ==================================================

            const diicotRole =
                getHighestDIICOTRole(
                    roles
                );


            // Dacă vrei să permiți DOAR persoanelor cu grad DIICOT,
            // decomentează blocul următor:

            /*
            if (!diicotRole) {

                return res.redirect(
                    "/?error=no_diicot_role"
                );

            }
            */


            // ==================================================
            // SESSION USER
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


            console.log(
                "=============================="
            );

            console.log(
                `LOGIN: ${discordUser.username}`
            );

            console.log(
                `GRAD: ${
                    diicotRole
                        ? diicotRole.name
                        : "FĂRĂ GRAD"
                }`
            );

            console.log(
                "=============================="
            );


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

        return res.status(401).json({

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

});


// ======================================================
// LOGOUT
// ======================================================

app.get("/logout", (req, res) => {

    req.session = null;

    res.redirect("/");

});


// ======================================================
// HEALTH
// ======================================================

app.get("/health", (req, res) => {

    res.status(200).json({

        status:
            "online",

        service:
            "DIICOT Hub"

    });

});


// ======================================================
// 404
// ======================================================

app.use((req, res) => {

    res.status(404).send(
        "Pagina nu a fost găsită."
    );

});


// ======================================================
// START SERVER
// ======================================================

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
            "=============================="
        );

    }
);
