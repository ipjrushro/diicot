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

const ANNOUNCEMENT_CHANNEL_ID = "1528758228450672803";

const VACATION_DAYS_LIMIT = 14;
const MEETING_EXCUSES_LIMIT = 2;


// ======================================================
// GRADE DIICOT
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


function getHighestDIICOTRole(roles = []) {

    return (
        DIICOT_ROLES.find(
            rank =>
                roles.includes(rank.id)
        ) || null
    );
}


// ======================================================
// EXPRESS
// ======================================================

app.set("trust proxy", 1);

app.use(
    express.json()
);

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
            process.env.NODE_ENV ===
            "production"
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


if (
    !fs.existsSync(
        uploadsDirectory
    )
) {

    fs.mkdirSync(
        uploadsDirectory,
        {
            recursive: true
        }
    );
}


const storage =
    multer.diskStorage({

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

            let extension =
                ".jpg";


            if (
                file.mimetype ===
                "image/png"
            ) {

                extension =
                    ".png";
            }


            if (
                file.mimetype ===
                "image/webp"
            ) {

                extension =
                    ".webp";
            }


            const filename =
                `${Date.now()}-${crypto
                    .randomBytes(8)
                    .toString("hex")}${extension}`;


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

const userProfiles =
    new Map();

const blacklist = [];

const leaveRequests = [];


// ======================================================
// HELPERS
// ======================================================

function formatRomanianDate(date) {

    return new Date(date)
        .toLocaleString(
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
        );
}


function formatDateOnlyRO(
    value
) {

    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "-";
    }


    return date
        .toLocaleDateString(
            "ro-RO",
            {
                timeZone:
                    "Europe/Bucharest",

                day:
                    "2-digit",

                month:
                    "2-digit",

                year:
                    "numeric"
            }
        );
}


function parseDateOnly(
    value
) {

    value =
        String(
            value || ""
        );


    if (
        !/^\d{4}-\d{2}-\d{2}$/
            .test(value)
    ) {

        return null;
    }


    const [
        year,
        month,
        day
    ] =
        value
            .split("-")
            .map(Number);


    const date =
        new Date(
            year,
            month - 1,
            day
        );


    if (
        date.getFullYear() !==
            year ||
        date.getMonth() !==
            month - 1 ||
        date.getDate() !==
            day
    ) {

        return null;
    }


    return date;
}


function inclusiveDays(
    start,
    end
) {

    const difference =
        end.getTime() -
        start.getTime();


    return (
        Math.floor(
            difference /
            86400000
        ) + 1
    );
}


// ======================================================
// CONCEDII HELPERS
// ======================================================

function getLeaveUsage(
    userId
) {

    const approved =
        leaveRequests.filter(
            request =>
                request.authorId ===
                    String(userId) &&
                request.status ===
                    "APPROVED"
        );


    const vacationUsed =
        approved
            .filter(
                request =>
                    request.type ===
                    "VACATION"
            )
            .reduce(
                (
                    total,
                    request
                ) =>
                    total +
                    Number(
                        request.days ||
                        0
                    ),

                0
            );


    const meetingExcusesUsed =
        approved.filter(
            request =>
                request.type ===
                "MEETING_EXCUSE"
        ).length;


    return {

        vacationUsed,

        vacationRemaining:
            Math.max(
                0,

                VACATION_DAYS_LIMIT -
                vacationUsed
            ),

        meetingExcusesUsed,

        meetingExcusesRemaining:
            Math.max(
                0,

                MEETING_EXCUSES_LIMIT -
                meetingExcusesUsed
            )
    };
}


function normalizeLeaveRequest(
    request
) {

    let statusLabel =
        "ANULAT";


    if (
        request.status ===
        "PENDING"
    ) {

        statusLabel =
            "ÎN AȘTEPTARE";
    }


    if (
        request.status ===
        "APPROVED"
    ) {

        statusLabel =
            "APROBAT";
    }


    if (
        request.status ===
        "REJECTED"
    ) {

        statusLabel =
            "RESPINS";
    }


    return {

        ...request,

        typeLabel:
            request.type ===
            "VACATION"

                ? "CONCEDIU"

                : "ÎNVOIRE ȘEDINȚĂ",

        statusLabel
    };
}


// ======================================================
// BLACKLIST HELPERS
// ======================================================

function updateBlacklistStatuses() {

    const now =
        new Date();


    for (
        const entry
        of blacklist
    ) {

        if (
            entry.status !==
            "ACTIVE"
        ) {

            continue;
        }


        if (
            entry.durationType !==
            "TEMPORARY"
        ) {

            continue;
        }


        if (
            !entry.expiresAt
        ) {

            continue;
        }


        const expiry =
            new Date(
                entry.expiresAt
            );


        if (
            !Number.isNaN(
                expiry.getTime()
            ) &&
            expiry <= now
        ) {

            entry.status =
                "INACTIVE";

            entry.deactivatedReason =
                "EXPIRED";

            entry.deactivatedAt =
                now.toISOString();

            entry.deactivatedAtFormatted =
                formatRomanianDate(
                    now
                );
        }
    }
}


async function getDiscordUserBasic(
    discordId
) {

    if (!BOT_TOKEN) {
        return null;
    }


    try {

        const response =
            await axios.get(

                `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`,

                {
                    headers: {

                        Authorization:
                            `Bot ${BOT_TOKEN}`
                    }
                }
            );


        const member =
            response.data;


        return {

            id:
                discordId,

            username:
                member.user?.username ||
                null,

            displayName:
                member.nick ||
                member.user?.global_name ||
                member.user?.username ||
                null,

            avatar:
                member.user?.avatar

                    ? `https://cdn.discordapp.com/avatars/${discordId}/${member.user.avatar}.png?size=128`

                    : "https://cdn.discordapp.com/embed/avatars/0.png"
        };

    }

    catch (error) {

        if (
            error.response?.status !==
            404
        ) {

            console.error(
                "Discord member error:",
                error.response?.data ||
                error.message
            );
        }


        return null;
    }
}


// ======================================================
// AUTH
// ======================================================

function requireAuth(
    req,
    res,
    next
) {

    if (
        !req.session?.user
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
        !req.session?.user
    ) {

        return res
            .status(401)
            .json({
                error:
                    "Trebuie să fii autentificat."
            });
    }


    if (
        Number(
            req.session.user.rankLevel ||
            0
        ) < 10
    ) {

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

    (
        req,
        res
    ) => {

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

    (
        req,
        res
    ) => {

        if (
            !req.session?.user
        ) {

            return res.redirect(
                "/"
            );
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

    (
        req,
        res
    ) => {

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

    (
        req,
        res
    ) => {

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

                state
            });


        res.redirect(
            "https://discord.com/oauth2/authorize?" +
            params.toString()
        );
    }
);


// ======================================================
// CALLBACK DISCORD
// ======================================================

app.get(
    "/auth/discord/callback",

    async (
        req,
        res
    ) => {

        const {
            code,
            state
        } =
            req.query;


        if (!code) {

            return res.redirect(
                "/?error=no_code"
            );
        }


        if (
            !state ||
            !req.session.oauthState ||
            state !==
            req.session.oauthState
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
                tokenResponse
                    .data
                    .access_token;


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
                Array.isArray(
                    member.roles
                )

                    ? member.roles
                        .map(String)

                    : [];


            const rank =
                getHighestDIICOTRole(
                    roles
                );


            const savedProfile =
                userProfiles.get(
                    discordUser.id
                );


            req.session.user = {

                id:
                    discordUser.id,

                username:
                    discordUser.username,

                globalName:
                    discordUser.global_name ||
                    discordUser.username,

                displayName:
                    savedProfile?.displayName ||
                    member.nick ||
                    discordUser.global_name ||
                    discordUser.username,

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


            res.redirect(
                "/"
            );

        }

        catch (error) {

            console.error(
                "Discord OAuth Error:",
                error.response?.data ||
                error.message
            );


            res.redirect(
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

    (
        req,
        res
    ) => {

        if (
            !req.session?.user
        ) {

            return res
                .status(401)
                .json({
                    loggedIn:
                        false
                });
        }


        res.json({

            loggedIn:
                true,

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

    async (
        req,
        res
    ) => {

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
                    Array.isArray(
                        member.roles
                    )

                        ? member.roles
                            .map(String)

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
                    userProfiles.get(
                        userId
                    );


                if (
                    !saved?.displayName
                ) {

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
            userProfiles.get(
                userId
            ) || {

                displayName:
                    null,

                duties:
                    []
            };


        if (
            saved.displayName
        ) {

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
                    report.authorId ===
                    userId
            );


        const reportsWithImages =
            myReports.filter(
                report =>
                    report.images?.length >
                    0
            ).length;


        res.json({

            success:
                true,

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
                    saved.duties ||
                    [],

                statistics: {

                    totalReports:
                        myReports.length,

                    reportsWithImages,

                    lastActivity:
                        myReports.length

                            ? myReports[0]
                                .createdAtFormatted

                            : "-"
                },

                recentActivity:
                    myReports
                        .slice(
                            0,
                            5
                        )
                        .map(
                            report => ({

                                id:
                                    report.id,

                                type:
                                    report.type,

                                title:
                                    report.title,

                                createdAtFormatted:
                                    report
                                        .createdAtFormatted
                            })
                        )
            }
        });
    }
);


app.patch(
    "/api/profile",

    requireAuth,

    async (
        req,
        res
    ) => {

        const userId =
            req.session.user.id;


        const nickname =
            String(
                req.body.nickname ||
                ""
            ).trim();


        const duties =
            Array.isArray(
                req.body.duties
            )

                ? req.body.duties
                    .map(
                        value =>
                            String(
                                value ||
                                ""
                            ).trim()
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


        if (
            duties.length > 8
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Poți avea maximum 8 atribuții."
                });
        }


        if (
            duties.some(
                duty =>
                    duty.length < 2 ||
                    duty.length > 80
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Fiecare atribuție trebuie să aibă între 2 și 80 de caractere."
                });
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


        let discordSynced =
            false;


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


                discordSynced =
                    true;

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

            success:
                true,

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
// RAPOARTE
// ======================================================

app.post(
    "/api/reports",

    requireAuth,

    upload.array(
        "images",
        5
    ),

    (
        req,
        res
    ) => {

        const type =
            String(
                req.body.type ||
                ""
            ).trim();


        const title =
            String(
                req.body.title ||
                ""
            ).trim();


        const description =
            String(
                req.body.description ||
                ""
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


        if (
            !allowedTypes.includes(
                type
            )
        ) {

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

            images:
                (
                    req.files ||
                    []
                ).map(
                    file => ({

                        filename:
                            file.filename,

                        url:
                            `/uploads/${file.filename}`
                    })
                ),

            createdAt:
                now.toISOString(),

            createdAtFormatted:
                formatRomanianDate(
                    now
                )
        };


        reports.unshift(
            report
        );


        res
            .status(201)
            .json({

                success:
                    true,

                message:
                    "Raportul a fost postat.",

                report
            });
    }
);


app.get(
    "/api/reports/my",

    requireAuth,

    (
        req,
        res
    ) => {

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


app.get(
    "/api/admin/reports",

    requireAdmin,

    (
        req,
        res
    ) => {

        res.json({

            success:
                true,

            total:
                reports.length,

            reports
        });
    }
);


// ======================================================
// CONDUCERE - ANUNȚURI
// ======================================================

app.post(
    "/api/leadership/announcement",

    requireAdmin,

    async (
        req,
        res
    ) => {

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
                req.body.title ||
                ""
            ).trim();


        const message =
            String(
                req.body.message ||
                ""
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

                ...(
                    avatarURL

                        ? {
                            icon_url:
                                avatarURL
                        }

                        : {}
                )
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
                new Date()
                    .toISOString()
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

                success:
                    true,

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
                error.response?.status ===
                403
            ) {

                return res
                    .status(403)
                    .json({
                        error:
                            "Botul nu are permisiunea să trimită mesaje sau embed-uri în canal."
                    });
            }


            if (
                error.response?.status ===
                404
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
// CONCEDII / ÎNVOIRI - DATELE MELE
// ======================================================

app.get(
    "/api/leave/me",

    requireAuth,

    (
        req,
        res
    ) => {

        const userId =
            String(
                req.session.user.id
            );


        const requests =
            leaveRequests
                .filter(
                    request =>
                        request.authorId ===
                        userId
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        new Date(
                            b.createdAt
                        ) -
                        new Date(
                            a.createdAt
                        )
                )
                .map(
                    normalizeLeaveRequest
                );


        res.json({

            success:
                true,

            limits: {

                vacationDays:
                    VACATION_DAYS_LIMIT,

                meetingExcuses:
                    MEETING_EXCUSES_LIMIT
            },

            usage:
                getLeaveUsage(
                    userId
                ),

            requests
        });
    }
);


// ======================================================
// CONCEDII / ÎNVOIRI - CERERE NOUĂ
// ======================================================

app.post(
    "/api/leave",

    requireAuth,

    (
        req,
        res
    ) => {

        const type =
            String(
                req.body.type ||
                ""
            )
                .trim()
                .toUpperCase();


        const startDateRaw =
            String(
                req.body.startDate ||
                ""
            ).trim();


        const endDateRaw =
            String(
                req.body.endDate ||
                ""
            ).trim();


        const reason =
            String(
                req.body.reason ||
                ""
            ).trim();


        if (
            ![
                "VACATION",
                "MEETING_EXCUSE"
            ].includes(
                type
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Tipul cererii nu este valid."
                });
        }


        if (
            reason.length < 3 ||
            reason.length > 1000
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Motivul trebuie să aibă între 3 și 1000 de caractere."
                });
        }


        const start =
            parseDateOnly(
                startDateRaw
            );


        const end =
            parseDateOnly(
                endDateRaw
            );


        if (
            !start ||
            !end
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Selectează o dată de început și o dată de sfârșit valide."
                });
        }


        if (
            end < start
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Data de sfârșit nu poate fi înaintea datei de început."
                });
        }


        const days =
            inclusiveDays(
                start,
                end
            );


        const userId =
            String(
                req.session.user.id
            );


        const usage =
            getLeaveUsage(
                userId
            );


        if (
            type ===
                "VACATION" &&
            days >
                usage
                    .vacationRemaining
        ) {

            return res
                .status(400)
                .json({
                    error:
                        `Mai ai doar ${usage.vacationRemaining} zile de concediu disponibile.`
                });
        }


        if (
            type ===
                "MEETING_EXCUSE" &&
            usage
                .meetingExcusesRemaining <=
                0
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Nu mai ai învoiri de ședință disponibile."
                });
        }


        const duplicatePending =
            leaveRequests.find(
                request =>
                    request.authorId ===
                        userId &&
                    request.status ===
                        "PENDING" &&
                    request.type ===
                        type &&
                    request.startDate ===
                        startDateRaw &&
                    request.endDate ===
                        endDateRaw
            );


        if (
            duplicatePending
        ) {

            return res
                .status(409)
                .json({
                    error:
                        "Ai deja o cerere în așteptare pentru același interval."
                });
        }


        const now =
            new Date();


        const request = {

            id:
                crypto.randomUUID(),

            authorId:
                userId,

            authorName:
                req.session.user.displayName ||
                req.session.user.username,

            authorUsername:
                req.session.user.username,

            authorRank:
                req.session.user.rank,

            type,

            startDate:
                startDateRaw,

            endDate:
                endDateRaw,

            startDateFormatted:
                formatDateOnlyRO(
                    start
                ),

            endDateFormatted:
                formatDateOnlyRO(
                    end
                ),

            days,

            reason,

            status:
                "PENDING",

            evaluatorId:
                null,

            evaluatorName:
                null,

            evaluatorRank:
                null,

            decisionNote:
                null,

            decidedAt:
                null,

            decidedAtFormatted:
                null,

            createdAt:
                now.toISOString(),

            createdAtFormatted:
                formatRomanianDate(
                    now
                )
        };


        leaveRequests.unshift(
            request
        );


        res
            .status(201)
            .json({

                success:
                    true,

                message:
                    "Cererea a fost trimisă spre evaluare.",

                request:
                    normalizeLeaveRequest(
                        request
                    ),

                usage:
                    getLeaveUsage(
                        userId
                    )
            });
    }
);


// ======================================================
// CONCEDII / ÎNVOIRI - ANULARE
// ======================================================

app.patch(
    "/api/leave/:id/cancel",

    requireAuth,

    (
        req,
        res
    ) => {

        const request =
            leaveRequests.find(
                item =>
                    item.id ===
                    req.params.id
            );


        if (!request) {

            return res
                .status(404)
                .json({
                    error:
                        "Cererea nu a fost găsită."
                });
        }


        if (
            request.authorId !==
            String(
                req.session.user.id
            )
        ) {

            return res
                .status(403)
                .json({
                    error:
                        "Nu poți anula cererea altui membru."
                });
        }


        if (
            request.status !==
            "PENDING"
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Poți anula doar cererile aflate în așteptare."
                });
        }


        request.status =
            "CANCELLED";

        request.cancelledAt =
            new Date()
                .toISOString();

        request.cancelledAtFormatted =
            formatRomanianDate(
                new Date()
            );


        res.json({

            success:
                true,

            message:
                "Cererea a fost anulată.",

            request:
                normalizeLeaveRequest(
                    request
                )
        });
    }
);


// ======================================================
// CONCEDII / ÎNVOIRI - ADMIN LISTĂ
// DOAR COORDONATOR+
// ======================================================

app.get(
    "/api/admin/leave",

    requireAdmin,

    (
        req,
        res
    ) => {

        const requests =
            [
                ...leaveRequests
            ]
                .sort(
                    (
                        a,
                        b
                    ) => {

                        if (
                            a.status ===
                                "PENDING" &&
                            b.status !==
                                "PENDING"
                        ) {

                            return -1;
                        }


                        if (
                            a.status !==
                                "PENDING" &&
                            b.status ===
                                "PENDING"
                        ) {

                            return 1;
                        }


                        return (
                            new Date(
                                b.createdAt
                            ) -
                            new Date(
                                a.createdAt
                            )
                        );
                    }
                )
                .map(
                    normalizeLeaveRequest
                );


        res.json({

            success:
                true,

            total:
                requests.length,

            pending:
                requests.filter(
                    request =>
                        request.status ===
                        "PENDING"
                ).length,

            approved:
                requests.filter(
                    request =>
                        request.status ===
                        "APPROVED"
                ).length,

            rejected:
                requests.filter(
                    request =>
                        request.status ===
                        "REJECTED"
                ).length,

            requests
        });
    }
);


// ======================================================
// CONCEDII / ÎNVOIRI - APROBARE / RESPINGERE
// DOAR COORDONATOR+
// ======================================================

app.patch(
    "/api/admin/leave/:id/decision",

    requireAdmin,

    (
        req,
        res
    ) => {

        const request =
            leaveRequests.find(
                item =>
                    item.id ===
                    req.params.id
            );


        if (!request) {

            return res
                .status(404)
                .json({
                    error:
                        "Cererea nu a fost găsită."
                });
        }


        if (
            request.status !==
            "PENDING"
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Această cerere a fost deja evaluată."
                });
        }


        const decision =
            String(
                req.body.decision ||
                ""
            )
                .trim()
                .toUpperCase();


        const note =
            String(
                req.body.note ||
                ""
            ).trim();


        if (
            ![
                "APPROVE",
                "REJECT"
            ].includes(
                decision
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Decizia nu este validă."
                });
        }


        if (
            note.length > 500
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Observația evaluatorului poate avea maximum 500 de caractere."
                });
        }


        if (
            decision ===
            "APPROVE"
        ) {

            const usage =
                getLeaveUsage(
                    request.authorId
                );


            if (
                request.type ===
                    "VACATION" &&
                request.days >
                    usage
                        .vacationRemaining
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            `Membrul mai are doar ${usage.vacationRemaining} zile de concediu disponibile.`
                    });
            }


            if (
                request.type ===
                    "MEETING_EXCUSE" &&
                usage
                    .meetingExcusesRemaining <=
                    0
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Membrul nu mai are învoiri de ședință disponibile."
                    });
            }
        }


        const now =
            new Date();


        request.status =
            decision ===
            "APPROVE"

                ? "APPROVED"

                : "REJECTED";


        request.evaluatorId =
            String(
                req.session.user.id
            );


        request.evaluatorName =
            req.session.user.displayName ||
            req.session.user.username;


        request.evaluatorRank =
            req.session.user.rank;


        request.decisionNote =
            note ||
            null;


        request.decidedAt =
            now.toISOString();


        request.decidedAtFormatted =
            formatRomanianDate(
                now
            );


        res.json({

            success:
                true,

            message:
                request.status ===
                "APPROVED"

                    ? "Cererea a fost aprobată."

                    : "Cererea a fost respinsă.",

            request:
                normalizeLeaveRequest(
                    request
                ),

            usage:
                getLeaveUsage(
                    request.authorId
                )
        });
    }
);


// ======================================================
// BLACKLIST - LISTĂ
// ======================================================

app.get(
    "/api/admin/blacklist",

    requireAdmin,

    (
        req,
        res
    ) => {

        updateBlacklistStatuses();


        const sorted =
            [
                ...blacklist
            ].sort(
                (
                    a,
                    b
                ) =>
                    new Date(
                        b.createdAt
                    ) -
                    new Date(
                        a.createdAt
                    )
            );


        res.json({

            success:
                true,

            total:
                sorted.length,

            active:
                sorted.filter(
                    entry =>
                        entry.status ===
                        "ACTIVE"
                ).length,

            inactive:
                sorted.filter(
                    entry =>
                        entry.status ===
                        "INACTIVE"
                ).length,

            blacklist:
                sorted
        });
    }
);


// ======================================================
// BLACKLIST - ADAUGĂ
// ======================================================

app.post(
    "/api/admin/blacklist",

    requireAdmin,

    async (
        req,
        res
    ) => {

        updateBlacklistStatuses();


        const discordId =
            String(
                req.body.discordId ||
                ""
            ).trim();


        let name =
            String(
                req.body.name ||
                ""
            ).trim();


        const reason =
            String(
                req.body.reason ||
                ""
            ).trim();


        const durationType =
            String(
                req.body.durationType ||
                "PERMANENT"
            )
                .trim()
                .toUpperCase();


        const expiresAtRaw =
            String(
                req.body.expiresAt ||
                ""
            ).trim();


        if (
            !/^\d{15,25}$/
                .test(
                    discordId
                )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Discord ID-ul nu este valid."
                });
        }


        if (
            ![
                "PERMANENT",
                "TEMPORARY"
            ].includes(
                durationType
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Tipul duratei nu este valid."
                });
        }


        if (
            reason.length < 3 ||
            reason.length > 1000
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Motivul trebuie să aibă între 3 și 1000 de caractere."
                });
        }


        let expiresAt =
            null;

        let expiresAtFormatted =
            "Permanent";


        if (
            durationType ===
            "TEMPORARY"
        ) {

            if (
                !expiresAtRaw
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Selectează data expirării."
                    });
            }


            const expiry =
                new Date(
                    expiresAtRaw
                );


            if (
                Number.isNaN(
                    expiry.getTime()
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Data expirării nu este validă."
                    });
            }


            if (
                expiry <=
                new Date()
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Data expirării trebuie să fie în viitor."
                    });
            }


            expiresAt =
                expiry.toISOString();

            expiresAtFormatted =
                formatRomanianDate(
                    expiry
                );
        }


        const existing =
            blacklist.find(
                entry =>
                    entry.discordId ===
                        discordId &&
                    entry.status ===
                        "ACTIVE"
            );


        if (existing) {

            return res
                .status(409)
                .json({
                    error:
                        "Acest Discord ID este deja în blacklist."
                });
        }


        const discordUser =
            await getDiscordUserBasic(
                discordId
            );


        if (
            !name &&
            discordUser
        ) {

            name =
                discordUser.displayName ||
                discordUser.username ||
                "";
        }


        if (!name) {

            name =
                "Necunoscut";
        }


        if (
            name.length > 80
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Numele este prea lung."
                });
        }


        const now =
            new Date();


        const entry = {

            id:
                crypto.randomUUID(),

            discordId,

            name,

            username:
                discordUser?.username ||
                null,

            avatar:
                discordUser?.avatar ||
                null,

            reason,

            durationType,

            expiresAt,

            expiresAtFormatted,

            status:
                "ACTIVE",

            createdAt:
                now.toISOString(),

            createdAtFormatted:
                formatRomanianDate(
                    now
                ),

            addedById:
                req.session.user.id,

            addedByName:
                req.session.user.displayName ||
                req.session.user.username,

            addedByUsername:
                req.session.user.username,

            addedByRank:
                req.session.user.rank,

            deactivatedAt:
                null,

            deactivatedAtFormatted:
                null,

            deactivatedById:
                null,

            deactivatedByName:
                null,

            deactivatedReason:
                null
        };


        blacklist.unshift(
            entry
        );


        res
            .status(201)
            .json({

                success:
                    true,

                message:
                    `${name} a fost adăugat în blacklist.`,

                entry
            });
    }
);


// ======================================================
// BLACKLIST - CHECK
// ======================================================

app.get(
    "/api/admin/blacklist/check/:discordId",

    requireAdmin,

    async (
        req,
        res
    ) => {

        updateBlacklistStatuses();


        const discordId =
            String(
                req.params.discordId ||
                ""
            ).trim();


        if (
            !/^\d{15,25}$/
                .test(
                    discordId
                )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Discord ID-ul nu este valid."
                });
        }


        const discordUser =
            await getDiscordUserBasic(
                discordId
            );


        const activeEntry =
            blacklist.find(
                entry =>
                    entry.discordId ===
                        discordId &&
                    entry.status ===
                        "ACTIVE"
            ) || null;


        res.json({

            success:
                true,

            foundOnDiscord:
                Boolean(
                    discordUser
                ),

            discordUser,

            blacklisted:
                Boolean(
                    activeEntry
                ),

            activeEntry
        });
    }
);


// ======================================================
// BLACKLIST - DETALII
// ======================================================

app.get(
    "/api/admin/blacklist/:id",

    requireAdmin,

    (
        req,
        res
    ) => {

        updateBlacklistStatuses();


        const entry =
            blacklist.find(
                item =>
                    item.id ===
                    req.params.id
            );


        if (!entry) {

            return res
                .status(404)
                .json({
                    error:
                        "Intrarea din blacklist nu a fost găsită."
                });
        }


        res.json({

            success:
                true,

            entry
        });
    }
);


// ======================================================
// BLACKLIST - EDITARE
// ======================================================

app.patch(
    "/api/admin/blacklist/:id",

    requireAdmin,

    (
        req,
        res
    ) => {

        updateBlacklistStatuses();


        const entry =
            blacklist.find(
                item =>
                    item.id ===
                    req.params.id
            );


        if (!entry) {

            return res
                .status(404)
                .json({
                    error:
                        "Intrarea din blacklist nu a fost găsită."
                });
        }


        const name =
            req.body.name !==
            undefined

                ? String(
                    req.body.name
                ).trim()

                : entry.name;


        const reason =
            req.body.reason !==
            undefined

                ? String(
                    req.body.reason
                ).trim()

                : entry.reason;


        const durationType =
            req.body.durationType !==
            undefined

                ? String(
                    req.body.durationType
                )
                    .trim()
                    .toUpperCase()

                : entry.durationType;


        if (
            name.length < 1 ||
            name.length > 80
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Numele trebuie să aibă maximum 80 de caractere."
                });
        }


        if (
            reason.length < 3 ||
            reason.length > 1000
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Motivul trebuie să aibă între 3 și 1000 de caractere."
                });
        }


        if (
            ![
                "PERMANENT",
                "TEMPORARY"
            ].includes(
                durationType
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Tipul duratei nu este valid."
                });
        }


        let expiresAt =
            entry.expiresAt;

        let expiresAtFormatted =
            entry.expiresAtFormatted;


        if (
            durationType ===
            "PERMANENT"
        ) {

            expiresAt =
                null;

            expiresAtFormatted =
                "Permanent";
        }


        if (
            durationType ===
            "TEMPORARY"
        ) {

            const raw =
                String(
                    req.body.expiresAt ||
                    entry.expiresAt ||
                    ""
                ).trim();


            if (!raw) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Selectează data expirării."
                    });
            }


            const expiry =
                new Date(
                    raw
                );


            if (
                Number.isNaN(
                    expiry.getTime()
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Data expirării nu este validă."
                    });
            }


            if (
                expiry <=
                new Date()
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Data expirării trebuie să fie în viitor."
                    });
            }


            expiresAt =
                expiry.toISOString();

            expiresAtFormatted =
                formatRomanianDate(
                    expiry
                );
        }


        Object.assign(
            entry,
            {

                name,

                reason,

                durationType,

                expiresAt,

                expiresAtFormatted,

                updatedAt:
                    new Date()
                        .toISOString(),

                updatedById:
                    req.session.user.id,

                updatedByName:
                    req.session.user.displayName ||
                    req.session.user.username
            }
        );


        res.json({

            success:
                true,

            message:
                "Intrarea din blacklist a fost actualizată.",

            entry
        });
    }
);


// ======================================================
// BLACKLIST - DEZACTIVEAZĂ
// ======================================================

app.patch(
    "/api/admin/blacklist/:id/deactivate",

    requireAdmin,

    (
        req,
        res
    ) => {

        updateBlacklistStatuses();


        const entry =
            blacklist.find(
                item =>
                    item.id ===
                    req.params.id
            );


        if (!entry) {

            return res
                .status(404)
                .json({
                    error:
                        "Intrarea din blacklist nu a fost găsită."
                });
        }


        if (
            entry.status ===
            "INACTIVE"
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Această intrare este deja inactivă."
                });
        }


        const now =
            new Date();


        Object.assign(
            entry,
            {

                status:
                    "INACTIVE",

                deactivatedAt:
                    now.toISOString(),

                deactivatedAtFormatted:
                    formatRomanianDate(
                        now
                    ),

                deactivatedById:
                    req.session.user.id,

                deactivatedByName:
                    req.session.user.displayName ||
                    req.session.user.username,

                deactivatedReason:
                    "MANUAL"
            }
        );


        res.json({

            success:
                true,

            message:
                "Persoana a fost scoasă din blacklist.",

            entry
        });
    }
);


// ======================================================
// BLACKLIST - REACTIVEAZĂ
// ======================================================

app.patch(
    "/api/admin/blacklist/:id/reactivate",

    requireAdmin,

    (
        req,
        res
    ) => {

        updateBlacklistStatuses();


        const entry =
            blacklist.find(
                item =>
                    item.id ===
                    req.params.id
            );


        if (!entry) {

            return res
                .status(404)
                .json({
                    error:
                        "Intrarea din blacklist nu a fost găsită."
                });
        }


        if (
            entry.status ===
            "ACTIVE"
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Această intrare este deja activă."
                });
        }


        if (
            entry.durationType ===
                "TEMPORARY" &&
            entry.expiresAt &&
            new Date(
                entry.expiresAt
            ) <=
                new Date()
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Perioada acestei sancțiuni a expirat. Modifică mai întâi data expirării."
                });
        }


        const duplicate =
            blacklist.find(
                item =>
                    item.discordId ===
                        entry.discordId &&
                    item.status ===
                        "ACTIVE" &&
                    item.id !==
                        entry.id
            );


        if (
            duplicate
        ) {

            return res
                .status(409)
                .json({
                    error:
                        "Există deja o intrare activă pentru acest Discord ID."
                });
        }


        Object.assign(
            entry,
            {

                status:
                    "ACTIVE",

                deactivatedAt:
                    null,

                deactivatedAtFormatted:
                    null,

                deactivatedById:
                    null,

                deactivatedByName:
                    null,

                deactivatedReason:
                    null,

                reactivatedAt:
                    new Date()
                        .toISOString(),

                reactivatedById:
                    req.session.user.id,

                reactivatedByName:
                    req.session.user.displayName ||
                    req.session.user.username
            }
        );


        res.json({

            success:
                true,

            message:
                "Intrarea a fost reactivată.",

            entry
        });
    }
);


// ======================================================
// BLACKLIST - ȘTERGE
// ======================================================

app.delete(
    "/api/admin/blacklist/:id",

    requireAdmin,

    (
        req,
        res
    ) => {

        const index =
            blacklist.findIndex(
                item =>
                    item.id ===
                    req.params.id
            );


        if (
            index === -1
        ) {

            return res
                .status(404)
                .json({
                    error:
                        "Intrarea din blacklist nu a fost găsită."
                });
        }


        const removed =
            blacklist.splice(
                index,
                1
            )[0];


        res.json({

            success:
                true,

            message:
                `${removed.name} a fost șters definitiv din blacklist.`
        });
    }
);


// ======================================================
// GRADE
// ======================================================

app.get(
    "/api/admin/roles",

    requireAdmin,

    (
        req,
        res
    ) => {

        res.json({

            success:
                true,

            roles:
                DIICOT_ROLES.map(
                    (
                        {
                            id,
                            name,
                            level
                        }
                    ) => ({

                        id,

                        name,

                        level
                    })
                )
        });
    }
);


app.patch(
    "/api/admin/members/:userId/role",

    requireAdmin,

    async (
        req,
        res
    ) => {

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
                req.params.userId ||
                ""
            ).trim();


        const roleId =
            String(
                req.body.roleId ||
                ""
            ).trim();


        const newRole =
            DIICOT_ROLES.find(
                role =>
                    role.id ===
                    roleId
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
            String(
                req.session.user.id
            )
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
                    memberResponse
                        .data
                        .roles
                )

                    ? memberResponse
                        .data
                        .roles
                        .map(String)

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
                        !diicotIDs.has(
                            id
                        )
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

                success:
                    true,

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
                error.response?.status ===
                403
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

    async (
        req,
        res
    ) => {

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

            let after =
                "0";

            let hasMore =
                true;


            while (hasMore) {

                const response =
                    await axios.get(

                        `https://discord.com/api/v10/guilds/${GUILD_ID}/members`,

                        {
                            params: {

                                limit:
                                    1000,

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
                    response.data.length <
                    1000
                ) {

                    hasMore =
                        false;

                }

                else {

                    after =
                        response.data[
                            response.data.length -
                            1
                        ].user.id;
                }
            }


            const personnel =
                [];


            for (
                const member
                of members
            ) {

                const roles =
                    Array.isArray(
                        member.roles
                    )

                        ? member.roles
                            .map(String)

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

                    avatar:
                        user.avatar

                            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`

                            : "https://cdn.discordapp.com/embed/avatars/0.png",

                    rank:
                        rank.name,

                    rankLevel:
                        rank.level,

                    rankRoleId:
                        rank.id,

                    duties:
                        saved?.duties ||
                        []
                });
            }


            personnel.sort(
                (
                    a,
                    b
                ) => {

                    if (
                        b.rankLevel !==
                        a.rankLevel
                    ) {

                        return (
                            b.rankLevel -
                            a.rankLevel
                        );
                    }


                    return a.displayName
                        .localeCompare(
                            b.displayName,
                            "ro"
                        );
                }
            );


            res.json({

                success:
                    true,

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

    (
        req,
        res
    ) => {

        req.session =
            null;


        res.clearCookie(
            "diicot_session"
        );


        res.redirect(
            "/"
        );
    }
);


// ======================================================
// HEALTH
// ======================================================

app.get(
    "/health",

    (
        req,
        res
    ) => {

        updateBlacklistStatuses();


        res.json({

            status:
                "online",

            service:
                "DIICOT Hub",

            reports:
                reports.length,

            profiles:
                userProfiles.size,

            blacklistTotal:
                blacklist.length,

            blacklistActive:
                blacklist.filter(
                    entry =>
                        entry.status ===
                        "ACTIVE"
                ).length,

            leaveRequestsTotal:
                leaveRequests.length,

            leaveRequestsPending:
                leaveRequests.filter(
                    request =>
                        request.status ===
                        "PENDING"
                ).length,

            vacationDaysLimit:
                VACATION_DAYS_LIMIT,

            meetingExcusesLimit:
                MEETING_EXCUSES_LIMIT,

            rolesConfigured:
                DIICOT_ROLES.length,

            botConfigured:
                Boolean(
                    BOT_TOKEN
                ),

            announcementChannel:
                ANNOUNCEMENT_CHANNEL_ID,

            adminMinimumRank:
                "COORDONATOR",

            blacklistEnabled:
                true,

            leaveSystemEnabled:
                true
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
                            "O imagine depășește 8 MB."
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


// ======================================================
// 404
// ======================================================

app.use(
    (
        req,
        res
    ) => {

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

        console.log(
            "=============================="
        );

        console.log(
            "DIICOT HUB ONLINE"
        );

        console.log(
            "PORT:",
            PORT
        );

        console.log(
            "ADMIN: COORDONATOR+"
        );

        console.log(
            "GRADE: ENABLED"
        );

        console.log(
            "CONDUCERE: ENABLED"
        );

        console.log(
            "BLACKLIST: ENABLED"
        );

        console.log(
            "CONCEDII / ÎNVOIRI: ENABLED"
        );

        console.log(
            "BOT:",
            BOT_TOKEN
                ? "CONNECTED"
                : "NOT CONFIGURED"
        );

        console.log(
            "=============================="
        );
    }
);
