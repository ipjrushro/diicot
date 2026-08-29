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

const ANNOUNCEMENT_CHANNEL_ID = "1518631380127580461";


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


function getHighestDIICOTRole(roles = []) {

    for (const rank of DIICOT_ROLES) {

        if (roles.includes(rank.id)) {
            return rank;
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

        maxAge: 24 * 60 * 60 * 1000,

        httpOnly: true,
        sameSite: "lax",

        secure:
            process.env.NODE_ENV === "production"
    })
);


// ======================================================
// UPLOADS
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


const storage = multer.diskStorage({

    destination(
        req,
        file,
        callback
    ) {

        callback(
            null,
            uploadsDirectory
        );
    },


    filename(
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


        const name =
            Date.now() +
            "-" +
            crypto
                .randomBytes(8)
                .toString("hex") +
            extension;


        callback(
            null,
            name
        );
    }
});


const upload = multer({

    storage,

    limits: {
        fileSize: 8 * 1024 * 1024,
        files: 5
    },


    fileFilter(
        req,
        file,
        callback
    ) {

        const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];


        if (
            allowed.includes(
                file.mimetype
            )
        ) {

            return callback(
                null,
                true
            );
        }


        callback(
            new Error(
                "Sunt acceptate doar imagini JPG, PNG și WEBP."
            )
        );
    }
});


app.use(
    "/uploads",
    express.static(
        uploadsDirectory
    )
);


// ======================================================
// DATE TEMPORARE
// SUPABASE ÎL FACEM LA FINAL
// ======================================================

const reports = [];

const userProfiles = new Map();


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


    const level =
        Number(
            req.session.user.rankLevel ||
            0
        );


    if (level < 10) {

        return res
            .status(403)
            .json({
                error:
                    "Nu ai acces la această secțiune."
            });
    }


    next();
}


// ======================================================
// PAGINI
// ======================================================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );
    }
);


app.get(
    "/dashboard",
    (req, res) => {

        if (
            !req.session ||
            !req.session.user
        ) {

            return res.redirect("/");
        }


        res.sendFile(
            path.join(
                __dirname,
                "dashboard.html"
            )
        );
    }
);


app.get(
    "/style.css",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "style.css"
            )
        );
    }
);


// ======================================================
// DISCORD LOGIN
// ======================================================

app.get(
    "/auth/discord",
    (req, res) => {

        if (
            !CLIENT_ID ||
            !CLIENT_SECRET ||
            !REDIRECT_URI ||
            !GUILD_ID
        ) {

            return res
                .status(500)
                .send(
                    "Configurarea Discord este incompletă."
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


        res.redirect(
            "https://discord.com/oauth2/authorize?" +
            params.toString()
        );
    }
);


// ======================================================
// CALLBACK
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

            const params =
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

                    params.toString(),

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


            const member =
                memberResponse.data;


            const roles =
                Array.isArray(member.roles)
                    ? member.roles.map(String)
                    : [];


            const rank =
                getHighestDIICOTRole(
                    roles
                );


            const savedProfile =
                userProfiles.get(
                    discordUser.id
                );


            const displayName =
                savedProfile?.displayName ||
                member.nick ||
                discordUser.global_name ||
                discordUser.username;


            req.session.user = {

                id:
                    discordUser.id,

                username:
                    discordUser.username,

                globalName:
                    discordUser.global_name ||
                    discordUser.username,

                displayName,

                avatar:
                    discordUser.avatar,

                roles,

                rank:
                    rank
                        ? rank.name
                        : "MEMBRU DIICOT",

                rankLevel:
                    rank
                        ? rank.level
                        : 0,

                rankRoleId:
                    rank
                        ? rank.id
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
// API ME
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
                    loggedIn: false
                });
        }


        res.json({

            loggedIn: true,

            user:
                req.session.user
        });
    }
);


// ======================================================
// PROFIL
// ======================================================

app.get(
    "/api/profile",

    requireAuth,

    async (req, res) => {

        const userId =
            req.session.user.id;


        let username =
            req.session.user.username;

        let avatar =
            req.session.user.avatar;

        let displayName =
            req.session.user.displayName;


        if (BOT_TOKEN) {

            try {

                const response =
                    await axios.get(

                        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,

                        {
                            headers: {
                                Authorization:
                                    `Bot ${BOT_TOKEN}`
                            }
                        }
                    );


                const member =
                    response.data;


                username =
                    member.user?.username ||
                    username;


                avatar =
                    member.user?.avatar ||
                    avatar;


                const roles =
                    Array.isArray(member.roles)
                        ? member.roles.map(String)
                        : [];


                const rank =
                    getHighestDIICOTRole(
                        roles
                    );


                req.session.user.roles =
                    roles;

                req.session.user.rank =
                    rank
                        ? rank.name
                        : "MEMBRU DIICOT";

                req.session.user.rankLevel =
                    rank
                        ? rank.level
                        : 0;

                req.session.user.rankRoleId =
                    rank
                        ? rank.id
                        : null;


                const saved =
                    userProfiles.get(userId);


                if (!saved?.displayName) {

                    displayName =
                        member.nick ||
                        member.user?.global_name ||
                        username;
                }

            }

            catch (error) {

                console.error(
                    "Profile Discord Error:",
                    error.response?.data ||
                    error.message
                );
            }
        }


        const saved =
            userProfiles.get(userId) || {
                displayName: null,
                duties: []
            };


        if (saved.displayName) {
            displayName =
                saved.displayName;
        }


        req.session.user.displayName =
            displayName;

        req.session.user.username =
            username;

        req.session.user.avatar =
            avatar;


        const myReports =
            reports.filter(
                report =>
                    report.authorId === userId
            );


        const reportsWithImages =
            myReports.filter(
                report =>
                    report.images?.length > 0
            ).length;


        res.json({

            success: true,

            profile: {

                id:
                    userId,

                username,

                displayName,

                avatar,

                rank:
                    req.session.user.rank,

                rankLevel:
                    req.session.user.rankLevel,

                duties:
                    saved.duties || [],

                statistics: {

                    totalReports:
                        myReports.length,

                    reportsWithImages,

                    lastActivity:
                        myReports.length
                            ? myReports[0].createdAtFormatted
                            : "-"
                },

                recentActivity:
                    myReports
                        .slice(0, 5)
                        .map(
                            report => ({
                                id:
                                    report.id,

                                type:
                                    report.type,

                                title:
                                    report.title,

                                createdAtFormatted:
                                    report.createdAtFormatted
                            })
                        )
            }
        });
    }
);


// ======================================================
// SALVARE PROFIL
// ======================================================

app.patch(
    "/api/profile",

    requireAuth,

    async (req, res) => {

        const userId =
            req.session.user.id;


        const nickname =
            String(
                req.body.nickname || ""
            ).trim();


        const duties =
            Array.isArray(req.body.duties)

                ? req.body.duties
                    .map(
                        value =>
                            String(value || "").trim()
                    )
                    .filter(Boolean)

                : [];


        if (
            nickname.length < 2 ||
            nickname.length > 32
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Numele trebuie să aibă între 2 și 32 de caractere."
                });
        }


        if (duties.length > 8) {

            return res
                .status(400)
                .json({
                    error:
                        "Poți avea maximum 8 atribuții."
                });
        }


        for (const duty of duties) {

            if (
                duty.length < 2 ||
                duty.length > 80
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Fiecare atribuție trebuie să aibă între 2 și 80 de caractere."
                    });
            }
        }


        userProfiles.set(
            userId,
            {
                displayName:
                    nickname,

                duties
            }
        );


        req.session.user.displayName =
            nickname;


        let discordSynced = false;


        if (BOT_TOKEN) {

            try {

                await axios.patch(

                    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,

                    {
                        nick:
                            nickname
                    },

                    {
                        headers: {
                            Authorization:
                                `Bot ${BOT_TOKEN}`,

                            "Content-Type":
                                "application/json"
                        }
                    }
                );


                discordSynced = true;

            }

            catch (error) {

                console.error(
                    "Nickname Discord Error:",
                    error.response?.data ||
                    error.message
                );
            }
        }


        res.json({

            success: true,

            discordSynced,

            profile: {
                displayName:
                    nickname,

                duties
            }
        });
    }
);


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
                        "Titlul trebuie să aibă între 2 și 120 de caractere."
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
                        "Descrierea trebuie să aibă între 2 și 5000 de caractere."
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
                req.session.user.displayName ||
                req.session.user.username,

            authorUsername:
                req.session.user.username,

            authorRank:
                req.session.user.rank,

            authorRankLevel:
                req.session.user.rankLevel,

            type,
            title,
            description,
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


        reports.unshift(report);


        res
            .status(201)
            .json({
                success: true,

                message:
                    "Raportul a fost postat.",

                report
            });
    }
);


// ======================================================
// RAPOARTE MELE
// ======================================================

app.get(
    "/api/reports/my",

    requireAuth,

    (req, res) => {

        res.json({

            reports:
                reports.filter(
                    report =>
                        report.authorId ===
                        req.session.user.id
                )
        });
    }
);


// ======================================================
// ADMIN RAPOARTE
// ======================================================

app.get(
    "/api/admin/reports",

    requireAdmin,

    (req, res) => {

        res.json({
            success: true,
            total: reports.length,
            reports
        });
    }
);


// ======================================================
// CONDUCERE - TRIMITE ANUNȚ DISCORD
// ======================================================

app.post(
    "/api/leadership/announcement",

    requireAdmin,

    async (req, res) => {

        if (!BOT_TOKEN) {

            return res
                .status(500)
                .json({
                    error:
                        "Botul Discord nu este configurat."
                });
        }


        const title =
            String(
                req.body.title || ""
            ).trim();


        const message =
            String(
                req.body.message || ""
            ).trim();


        if (
            title.length < 2 ||
            title.length > 120
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Titlul trebuie să aibă între 2 și 120 de caractere."
                });
        }


        if (
            message.length < 2 ||
            message.length > 4000
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Mesajul trebuie să aibă între 2 și 4000 de caractere."
                });
        }


        const authorName =
            req.session.user.displayName ||
            req.session.user.username ||
            "Conducere DIICOT";


        const authorRank =
            req.session.user.rank ||
            "CONDUCERE DIICOT";


        const avatarURL =
            req.session.user.avatar

                ? `https://cdn.discordapp.com/avatars/${req.session.user.id}/${req.session.user.avatar}.png?size=128`

                : null;


        const embed = {

            title:
                `📢 ${title}`,

            description:
                message,

            color:
                0xFFC400,

            author: {

                name:
                    `${authorName} • ${authorRank}`,

                ...(avatarURL
                    ? {
                        icon_url:
                            avatarURL
                    }
                    : {})
            },

            fields: [
                {
                    name:
                        "STRUCTURĂ",

                    value:
                        "Direcția de Investigare a Infracțiunilor de Criminalitate Organizată și Terorism",

                    inline:
                        false
                }
            ],

            footer: {
                text:
                    "DIICOT • Rush România • Comunicat oficial"
            },

            timestamp:
                new Date().toISOString()
        };


        try {

            const response =
                await axios.post(

                    `https://discord.com/api/v10/channels/${ANNOUNCEMENT_CHANNEL_ID}/messages`,

                    {
                        embeds: [
                            embed
                        ],

                        allowed_mentions: {
                            parse: []
                        }
                    },

                    {
                        headers: {
                            Authorization:
                                `Bot ${BOT_TOKEN}`,

                            "Content-Type":
                                "application/json"
                        }
                    }
                );


            res.json({

                success: true,

                message:
                    "Anunțul a fost trimis pe Discord.",

                discordMessageId:
                    response.data.id
            });

        }

        catch (error) {

            console.error(
                "Discord Announcement Error:",
                error.response?.data ||
                error.message
            );


            if (
                error.response?.status === 403
            ) {

                return res
                    .status(403)
                    .json({
                        error:
                            "Botul nu are permisiunea să trimită mesaje sau embed-uri în canal."
                    });
            }


            if (
                error.response?.status === 404
            ) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Canalul Discord nu a fost găsit."
                    });
            }


            res
                .status(500)
                .json({
                    error:
                        "Anunțul nu a putut fi trimis."
                });
        }
    }
);


// ======================================================
// LISTA GRADE
// ======================================================

app.get(
    "/api/admin/roles",

    requireAdmin,

    (req, res) => {

        res.json({

            success: true,

            roles:
                DIICOT_ROLES.map(
                    role => ({
                        id:
                            role.id,

                        name:
                            role.name,

                        level:
                            role.level
                    })
                )
        });
    }
);


// ======================================================
// SCHIMBARE GRAD
// ======================================================

app.patch(
    "/api/admin/members/:userId/role",

    requireAdmin,

    async (req, res) => {

        if (!BOT_TOKEN) {

            return res
                .status(500)
                .json({
                    error:
                        "Botul Discord nu este configurat."
                });
        }


        const targetUserId =
            String(
                req.params.userId || ""
            ).trim();


        const roleId =
            String(
                req.body.roleId || ""
            ).trim();


        const newRole =
            DIICOT_ROLES.find(
                role =>
                    role.id === roleId
            );


        if (!newRole) {

            return res
                .status(400)
                .json({
                    error:
                        "Gradul nu este valid."
                });
        }


        if (
            targetUserId ===
            String(req.session.user.id)
        ) {

            return res
                .status(403)
                .json({
                    error:
                        "Nu îți poți modifica propriul grad."
                });
        }


        try {

            const memberResponse =
                await axios.get(

                    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${targetUserId}`,

                    {
                        headers: {
                            Authorization:
                                `Bot ${BOT_TOKEN}`
                        }
                    }
                );


            const currentRoles =
                Array.isArray(
                    memberResponse.data.roles
                )

                    ? memberResponse.data.roles.map(String)

                    : [];


            const diicotIDs =
                new Set(
                    DIICOT_ROLES.map(
                        role =>
                            role.id
                    )
                );


            const otherRoles =
                currentRoles.filter(
                    id =>
                        !diicotIDs.has(id)
                );


            await axios.patch(

                `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${targetUserId}`,

                {
                    roles: [
                        ...otherRoles,
                        roleId
                    ]
                },

                {
                    headers: {
                        Authorization:
                            `Bot ${BOT_TOKEN}`,

                        "Content-Type":
                            "application/json"
                    }
                }
            );


            res.json({

                success: true,

                message:
                    `Gradul a fost schimbat în ${newRole.name}.`
            });

        }

        catch (error) {

            console.error(
                "Role Update Error:",
                error.response?.data ||
                error.message
            );


            if (
                error.response?.status === 403
            ) {

                return res
                    .status(403)
                    .json({
                        error:
                            "Discord nu permite botului să gestioneze acest rol. Verifică poziția rolului botului."
                    });
            }


            res
                .status(500)
                .json({
                    error:
                        "Gradul nu a putut fi modificat."
                });
        }
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
                        "Botul Discord nu este configurat."
                });
        }


        try {

            let members = [];

            let after = "0";

            let hasMore = true;


            while (hasMore) {

                const response =
                    await axios.get(

                        `https://discord.com/api/v10/guilds/${GUILD_ID}/members`,

                        {
                            params: {
                                limit: 1000,
                                after
                            },

                            headers: {
                                Authorization:
                                    `Bot ${BOT_TOKEN}`
                            }
                        }
                    );


                members.push(
                    ...response.data
                );


                if (
                    response.data.length < 1000
                ) {

                    hasMore = false;

                }

                else {

                    after =
                        response.data[
                            response.data.length - 1
                        ].user.id;
                }
            }


            const personnel = [];


            for (const member of members) {

                const roles =
                    Array.isArray(member.roles)

                        ? member.roles.map(String)

                        : [];


                const rank =
                    getHighestDIICOTRole(
                        roles
                    );


                if (!rank) {
                    continue;
                }


                const user =
                    member.user;


                const saved =
                    userProfiles.get(
                        user.id
                    );


                const avatar =
                    user.avatar

                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`

                        : "https://cdn.discordapp.com/embed/avatars/0.png";


                personnel.push({

                    id:
                        user.id,

                    username:
                        user.username,

                    displayName:
                        saved?.displayName ||
                        member.nick ||
                        user.global_name ||
                        user.username,

                    avatar,

                    rank:
                        rank.name,

                    rankLevel:
                        rank.level,

                    rankRoleId:
                        rank.id,

                    duties:
                        saved?.duties || []
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


                    return a.displayName.localeCompare(
                        b.displayName,
                        "ro"
                    );
                }
            );


            res.json({

                success: true,

                total:
                    personnel.length,

                personnel
            });

        }

        catch (error) {

            console.error(
                "Personnel Error:",
                error.response?.data ||
                error.message
            );


            res
                .status(500)
                .json({
                    error:
                        "Personalul DIICOT nu a putut fi încărcat."
                });
        }
    }
);


// ======================================================
// LOGOUT
// ======================================================

app.get(
    "/logout",

    (req, res) => {

        req.session = null;

        res.clearCookie(
            "diicot_session"
        );

        res.redirect("/");
    }
);


// ======================================================
// HEALTH
// ======================================================

app.get(
    "/health",

    (req, res) => {

        res.json({

            status:
                "online",

            service:
                "DIICOT Hub",

            reports:
                reports.length,

            profiles:
                userProfiles.size,

            rolesConfigured:
                DIICOT_ROLES.length,

            botConfigured:
                Boolean(BOT_TOKEN),

            announcementChannel:
                ANNOUNCEMENT_CHANNEL_ID,

            adminMinimumRank:
                "COORDONATOR"
        });
    }
);


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
            error instanceof multer.MulterError
        ) {

            if (
                error.code === "LIMIT_FILE_SIZE"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "O imagine depășește 8 MB."
                    });
            }


            if (
                error.code === "LIMIT_FILE_COUNT"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Poți încărca maximum 5 imagini."
                    });
            }
        }


        console.error(
            "Server Error:",
            error
        );


        res
            .status(400)
            .json({
                error:
                    error.message ||
                    "A apărut o eroare."
            });
    }
);


app.use(
    (req, res) => {

        res
            .status(404)
            .send(
                "Pagina nu a fost găsită."
            );
    }
);


// ======================================================
// START
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",

    () => {

        console.log("");
        console.log("==============================");
        console.log("DIICOT HUB ONLINE");
        console.log("PORT:", PORT);
        console.log("ADMIN: COORDONATOR+");
        console.log("GRADE: ENABLED");
        console.log("CONDUCERE: ENABLED");
        console.log(
            "ANNOUNCEMENT CHANNEL:",
            ANNOUNCEMENT_CHANNEL_ID
        );
        console.log(
            "BOT:",
            BOT_TOKEN
                ? "CONNECTED"
                : "NOT CONFIGURED"
        );
        console.log("==============================");
        console.log("");
    }
);
