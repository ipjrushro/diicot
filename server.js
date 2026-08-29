const express = require("express");
const axios = require("axios");
const cookieSession = require("cookie-session");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const fs = require("fs");

require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;


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
// UPLOAD DIRECTORY
// ======================================================

const uploadsDirectory =
    path.join(
        __dirname,
        "uploads"
    );


if (!fs.existsSync(uploadsDirectory)) {

    fs.mkdirSync(
        uploadsDirectory,
        {
            recursive: true
        }
    );

}


// ======================================================
// MULTER
// ======================================================

const storage =
    multer.diskStorage({

        destination: function (
            req,
            file,
            callback
        ) {

            callback(
                null,
                uploadsDirectory
            );

        },


        filename: function (
            req,
            file,
            callback
        ) {

            let extension = ".jpg";


            if (file.mimetype === "image/png") {
                extension = ".png";
            }


            if (file.mimetype === "image/webp") {
                extension = ".webp";
            }


            const filename =
                Date.now() +
                "-" +
                crypto
                    .randomBytes(8)
                    .toString("hex") +
                extension;


            callback(
                null,
                filename
            );

        }

    });


const upload =
    multer({

        storage,

        limits: {

            fileSize:
                8 *
                1024 *
                1024,

            files:
                5

        },


        fileFilter: function (
            req,
            file,
            callback
        ) {

            const allowed = [
                "image/jpeg",
                "image/png",
                "image/webp"
            ];


            if (allowed.includes(file.mimetype)) {

                return callback(
                    null,
                    true
                );

            }


            return callback(
                new Error(
                    "Sunt acceptate doar imagini JPG, PNG și WEBP."
                )
            );

        }

    });


// ======================================================
// RAPOARTE
// TEMPORAR ÎN MEMORIA SERVERULUI
// ======================================================

const reports = [];


// ======================================================
// AUTH
// ======================================================

function requireAuth(
    req,
    res,
    next
) {

    if (
        !req.session ||
        !req.session.user
    ) {

        return res
            .status(401)
            .json({
                error:
                    "Trebuie să fii autentificat."
            });

    }


    next();
}


// ======================================================
// ADMIN = COORDONATOR+
// ======================================================

function requireAdmin(
    req,
    res,
    next
) {

    if (
        !req.session ||
        !req.session.user
    ) {

        return res
            .status(401)
            .json({
                error:
                    "Trebuie să fii autentificat."
            });

    }


    const rankLevel =
        Number(
            req.session.user.rankLevel || 0
        );


    if (rankLevel < 10) {

        return res
            .status(403)
            .json({
                error:
                    "Nu ai acces la Administrare."
            });

    }


    next();
}


// ======================================================
// PAGINI
// ======================================================

app.get("/", (req, res) => {

    return res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );

});


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
// CSS
// ======================================================

app.get("/style.css", (req, res) => {

    return res.sendFile(
        path.join(
            __dirname,
            "style.css"
        )
    );

});


// ======================================================
// UPLOADS
// ======================================================

app.use(
    "/uploads",
    express.static(
        uploadsDirectory
    )
);


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
                    "Member error:",
                    memberError.response?.data ||
                    memberError.message
                );


                return res.redirect(
                    "/?error=not_member"
                );

            }


            const roles =
                Array.isArray(member.roles)

                    ? member.roles.map(String)

                    : [];


            const diicotRole =
                getHighestDIICOTRole(
                    roles
                );


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

        loggedIn: true,

        user:
            req.session.user

    });

});


// ======================================================
// POSTARE RAPORT
// ======================================================

app.post(
    "/api/reports",

    requireAuth,

    upload.array(
        "images",
        5
    ),

    (req, res) => {

        const type =
            String(
                req.body.type || ""
            ).trim();


        const title =
            String(
                req.body.title || ""
            ).trim();


        const description =
            String(
                req.body.description || ""
            ).trim();


        const allowedTypes = [

            "RAZIE",
            "ANTRENAMENT",
            "JAFURI",
            "PATRULA",
            "PERCHEZITIE",
            "VERIFICARE ZONA",
            "FOCURI DE ARMA"

        ];


        if (!allowedTypes.includes(type)) {

            return res
                .status(400)
                .json({
                    error:
                        "Tipul raportului nu este valid."
                });

        }


        if (
            title.length < 2 ||
            title.length > 120
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Titlul trebuie să aibă între 2 și 120 caractere."
                });

        }


        if (
            description.length < 2 ||
            description.length > 5000
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Descrierea trebuie să aibă între 2 și 5000 caractere."
                });

        }


        const images =
            (req.files || [])
                .map(
                    file => ({

                        filename:
                            file.filename,

                        url:
                            `/uploads/${file.filename}`

                    })
                );


        const now =
            new Date();


        const report = {

            id:
                crypto.randomUUID(),

            authorId:
                req.session.user.id,

            authorName:
                req.session.user.globalName ||
                req.session.user.username,

            authorUsername:
                req.session.user.username,

            authorRank:
                req.session.user.rank,

            authorRankLevel:
                req.session.user.rankLevel,

            type:
                type,

            title:
                title,

            description:
                description,

            images:
                images,

            createdAt:
                now.toISOString(),

            createdAtFormatted:
                now.toLocaleString(
                    "ro-RO",
                    {

                        timeZone:
                            "Europe/Bucharest",

                        day:
                            "2-digit",

                        month:
                            "2-digit",

                        year:
                            "numeric",

                        hour:
                            "2-digit",

                        minute:
                            "2-digit"

                    }
                )

        };


        reports.unshift(
            report
        );


        return res
            .status(201)
            .json({

                success: true,

                message:
                    "Raportul a fost postat cu succes.",

                report:
                    report

            });

    }
);


// ======================================================
// RAPOARTELE MELE
// ======================================================

app.get(
    "/api/reports/my",

    requireAuth,

    (req, res) => {

        const userReports =
            reports.filter(

                report =>
                    report.authorId ===
                    req.session.user.id

            );


        return res.json({

            reports:
                userReports

        });

    }
);


// ======================================================
// ADMIN - TOATE RAPOARTELE
// COORDONATOR+
// ======================================================

app.get(
    "/api/admin/reports",

    requireAdmin,

    (req, res) => {

        return res.json({

            success: true,

            total:
                reports.length,

            reports:
                reports

        });

    }
);


// ======================================================
// PERSONAL DIICOT
// ======================================================

app.get(
    "/api/personnel",

    requireAuth,

    async (req, res) => {

        if (!BOT_TOKEN) {

            return res
                .status(500)
                .json({
                    error:
                        "DISCORD_BOT_TOKEN nu este configurat."
                });

        }


        try {

            let allMembers = [];

            let after = "0";

            let hasMore = true;


            while (hasMore) {

                const response =
                    await axios.get(

                        `https://discord.com/api/v10/guilds/${GUILD_ID}/members`,

                        {

                            params: {

                                limit:
                                    1000,

                                after:
                                    after

                            },

                            headers: {

                                Authorization:
                                    `Bot ${BOT_TOKEN}`

                            }

                        }

                    );


                const members =
                    response.data;


                allMembers.push(
                    ...members
                );


                if (
                    members.length < 1000
                ) {

                    hasMore =
                        false;

                }

                else {

                    after =
                        members[
                            members.length - 1
                        ].user.id;

                }

            }


            const personnel = [];


            for (
                const member
                of allMembers
            ) {

                const memberRoles =
                    Array.isArray(
                        member.roles
                    )

                        ? member.roles.map(String)

                        : [];


                const diicotRole =
                    getHighestDIICOTRole(
                        memberRoles
                    );


                if (!diicotRole) {
                    continue;
                }


                const user =
                    member.user;


                let avatarUrl =
                    "https://cdn.discordapp.com/embed/avatars/0.png";


                if (user.avatar) {

                    avatarUrl =
                        `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;

                }


                personnel.push({

                    id:
                        user.id,

                    username:
                        user.username,

                    displayName:
                        member.nick ||
                        user.global_name ||
                        user.username,

                    avatar:
                        avatarUrl,

                    rank:
                        diicotRole.name,

                    rankLevel:
                        diicotRole.level,

                    rankRoleId:
                        diicotRole.id

                });

            }


            personnel.sort(
                (a, b) => {

                    if (
                        b.rankLevel !==
                        a.rankLevel
                    ) {

                        return (
                            b.rankLevel -
                            a.rankLevel
                        );

                    }


                    return (
                        a.displayName || ""
                    ).localeCompare(
                        b.displayName || "",
                        "ro"
                    );

                }
            );


            return res.json({

                success:
                    true,

                total:
                    personnel.length,

                personnel:
                    personnel

            });

        }

        catch (error) {

            console.error(
                "Personnel Discord Error:",
                error.response?.data ||
                error.message
            );


            return res
                .status(500)
                .json({
                    error:
                        "Nu am putut încărca personalul DIICOT."
                });

        }

    }
);


// ======================================================
// LOGOUT
// ======================================================

app.get("/logout", (req, res) => {

    req.session =
        null;


    res.clearCookie(
        "diicot_session",

        {

            httpOnly:
                true,

            sameSite:
                "lax",

            secure:
                process.env.NODE_ENV ===
                "production"

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

        reports:
            reports.length,

        rolesConfigured:
            DIICOT_ROLES.length,

        botConfigured:
            Boolean(BOT_TOKEN)

    });

});


// ======================================================
// ERRORS
// ======================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        if (
            error instanceof
            multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "O poză este prea mare. Maximum 8 MB."
                    });

            }


            if (
                error.code ===
                "LIMIT_FILE_COUNT"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Poți încărca maximum 5 poze."
                    });

            }


            return res
                .status(400)
                .json({
                    error:
                        error.message
                });

        }


        if (error) {

            console.error(
                "Server error:",
                error
            );


            return res
                .status(400)
                .json({
                    error:
                        error.message ||
                        "A apărut o eroare."
                });

        }


        next();

    }
);


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
        console.log("============================");
        console.log("DIICOT HUB ONLINE");
        console.log("PORT:", PORT);
        console.log("ADMIN: COORDONATOR+");
        console.log("============================");
        console.log("");

    }
);
