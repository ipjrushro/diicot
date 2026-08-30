const express = require("express");
const axios = require("axios");
const cookieSession = require("cookie-session");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_BUCKET = "report-images";

const ANNOUNCEMENT_CHANNEL_ID = "1528758228450672803";

const VACATION_DAYS_LIMIT = 14;
const MEETING_EXCUSES_LIMIT = 2;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn(
        "[SUPABASE] Lipsesc SUPABASE_URL sau SUPABASE_SERVICE_KEY."
    );
}

const supabase = createClient(
    SUPABASE_URL || "https://example.supabase.co",
    SUPABASE_SERVICE_KEY || "missing-key",
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    }
);


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
            rank => roles.includes(rank.id)
        ) || null
    );
}


// ======================================================
// HELPERS ACȚIUNI CONDUCERE
// ======================================================

function getDIICOTRoleByLevel(level) {
    return (
        DIICOT_ROLES.find(
            role =>
                Number(role.level) ===
                Number(level)
        ) || null
    );
}


function normalizeCallsign(value) {

    let raw =
        String(value || "")
            .trim()
            .toUpperCase();

    /*
     * Acceptăm:
     * 6
     * 06
     * D-6
     * D-06
     * [D-06]
     */

    raw =
        raw.replace(
            /^\[?D-/,
            ""
        );

    raw =
        raw.replace(
            /\]?$/,
            ""
        );

    raw =
        raw.trim();

    if (
        !/^\d{1,2}$/.test(raw)
    ) {
        return null;
    }

    const number =
        Number(raw);

    if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > 99
    ) {
        return null;
    }

    return (
        "D-" +
        String(number).padStart(
            2,
            "0"
        )
    );
}


function removeExistingCallsign(name) {

    return String(name || "")
        .replace(
            /^\s*\[D-\d{1,2}\]\s*/i,
            ""
        )
        .trim();
}


function buildCallsignNickname(
    callsign,
    currentName
) {

    const cleanName =
        removeExistingCallsign(
            currentName
        );

    return `[${callsign}] ${cleanName}`.trim();
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
// FIȘIERE STATICE
// Logo-ul DIICOT poate rămâne în /uploads
// Pozele rapoartelor merg în Supabase Storage.
// ======================================================

const uploadsDirectory =
    path.join(
        __dirname,
        "uploads"
    );

app.use(
    "/uploads",
    express.static(
        uploadsDirectory
    )
);


// ======================================================
// MULTER - MEMORIE
// Nu mai salvăm pozele rapoartelor pe discul Render.
// ======================================================

const upload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                8 *
                1024 *
                1024,

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


// ======================================================
// HELPERS GENERALE
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


function formatDateOnlyRO(value) {

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


function parseDateOnly(value) {

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


function getExtensionFromMime(
    mimetype
) {

    if (
        mimetype ===
        "image/png"
    ) {

        return "png";
    }

    if (
        mimetype ===
        "image/webp"
    ) {

        return "webp";
    }

    return "jpg";
}


// ======================================================
// SUPABASE HELPERS
// ======================================================

function ensureSupabase(
    res
) {

    if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_KEY
    ) {

        res
            .status(503)
            .json({
                error:
                    "Supabase nu este configurat pe server."
            });

        return false;
    }

    return true;
}


function mapReport(row) {

    if (!row) {
        return null;
    }

    return {
        id:
            row.id,

        authorId:
            row.author_id,

        authorName:
            row.author_name,

        authorUsername:
            row.author_username,

        authorRank:
            row.author_rank,

        authorRankLevel:
            row.author_rank_level,

        type:
            row.type,

        title:
            row.title,

        description:
            row.description,

        images:
            Array.isArray(
                row.images
            )
                ? row.images
                : [],

        createdAt:
            row.created_at,

        createdAtFormatted:
            formatRomanianDate(
                row.created_at
            )
    };
}

function mapBlacklist(row) {

    if (!row) {
        return null;
    }

    return {
        id:
            row.id,

        discordId:
            row.discord_id,

        name:
            row.name,

        username:
            row.username,

        avatar:
            row.avatar,

        reason:
            row.reason,

        durationType:
            row.duration_type,

        expiresAt:
            row.expires_at,

        expiresAtFormatted:
            row.duration_type ===
            "PERMANENT"

                ? "Permanent"

                : row.expires_at

                    ? formatRomanianDate(
                        row.expires_at
                    )

                    : "-",

        status:
            row.status,

        createdAt:
            row.created_at,

        createdAtFormatted:
            formatRomanianDate(
                row.created_at
            ),

        addedById:
            row.added_by_id,

        addedByName:
            row.added_by_name,

        addedByUsername:
            row.added_by_username,

        addedByRank:
            row.added_by_rank,

        deactivatedAt:
            row.deactivated_at,

        deactivatedAtFormatted:
            row.deactivated_at

                ? formatRomanianDate(
                    row.deactivated_at
                )

                : null,

        deactivatedById:
            row.deactivated_by_id,

        deactivatedByName:
            row.deactivated_by_name,

        deactivatedReason:
            row.deactivated_reason,

        updatedAt:
            row.updated_at,

        updatedById:
            row.updated_by_id,

        updatedByName:
            row.updated_by_name
    };
}


function mapLeaveRequest(row) {

    if (!row) {
        return null;
    }

    const request = {
        id:
            row.id,

        authorId:
            row.author_id,

        authorName:
            row.author_name,

        authorUsername:
            row.author_username,

        authorRank:
            row.author_rank,

        type:
            row.type,

        startDate:
            row.start_date,

        endDate:
            row.end_date,

        startDateFormatted:
            formatDateOnlyRO(
                `${row.start_date}T12:00:00`
            ),

        endDateFormatted:
            formatDateOnlyRO(
                `${row.end_date}T12:00:00`
            ),

        days:
            Number(
                row.days || 1
            ),

        reason:
            row.reason,

        status:
            row.status,

        evaluatorId:
            row.evaluator_id,

        evaluatorName:
            row.evaluator_name,

        evaluatorRank:
            row.evaluator_rank,

        decisionNote:
            row.decision_note,

        decidedAt:
            row.decided_at,

        decidedAtFormatted:
            row.decided_at

                ? formatRomanianDate(
                    row.decided_at
                )

                : null,

        cancelledAt:
            row.cancelled_at,

        cancelledAtFormatted:
            row.cancelled_at

                ? formatRomanianDate(
                    row.cancelled_at
                )

                : null,

        createdAt:
            row.created_at,

        createdAtFormatted:
            formatRomanianDate(
                row.created_at
            )
    };

    return normalizeLeaveRequest(
        request
    );
}


// ======================================================
// CONCEDII HELPERS
// ======================================================

async function getLeaveUsage(
    userId
) {

    const {
        data,
        error
    } =
        await supabase
            .from(
                "leave_requests"
            )
            .select(
                "type, days"
            )
            .eq(
                "author_id",
                String(userId)
            )
            .eq(
                "status",
                "APPROVED"
            );

    if (error) {
        throw error;
    }

    const approved =
        data || [];

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

async function updateBlacklistStatuses() {

    const now =
        new Date()
            .toISOString();

    const {
        error
    } =
        await supabase
            .from(
                "blacklist"
            )
            .update({
                status:
                    "INACTIVE",

                deactivated_reason:
                    "EXPIRED",

                deactivated_at:
                    now,

                updated_at:
                    now
            })
            .eq(
                "status",
                "ACTIVE"
            )
            .eq(
                "duration_type",
                "TEMPORARY"
            )
            .not(
                "expires_at",
                "is",
                null
            )
            .lte(
                "expires_at",
                now
            );

    if (error) {

        console.error(
            "Blacklist expiry update:",
            error.message
        );
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
// AUTH MIDDLEWARE
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

            let savedProfile =
                null;

            if (
                SUPABASE_URL &&
                SUPABASE_SERVICE_KEY
            ) {

                const {
                    data,
                    error
                } =
                    await supabase
                        .from(
                            "user_profiles"
                        )
                        .select(
                            "*"
                        )
                        .eq(
                            "user_id",
                            discordUser.id
                        )
                        .maybeSingle();

                if (!error) {
                    savedProfile =
                        data;
                }
            }

            req.session.user = {

                id:
                    discordUser.id,

                username:
                    discordUser.username,

                globalName:
                    discordUser.global_name ||
                    discordUser.username,

                displayName:
                    savedProfile?.display_name ||
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
// PROFILUL MEU
// ======================================================

app.get(
    "/api/profile",

    requireAuth,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }

        try {

            const userId =
                String(
                    req.session.user.id
                );

            let username =
                req.session.user.username;

            let avatar =
                req.session.user.avatar;

            let displayName =
                req.session.user.displayName;

            let discordMember =
                null;

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

                    discordMember =
                        response.data;

                    username =
                        discordMember.user?.username ||
                        username;

                    avatar =
                        discordMember.user?.avatar ||
                        avatar;

                    const roles =
                        Array.isArray(
                            discordMember.roles
                        )

                            ? discordMember.roles
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

                }

                catch (error) {

                    console.error(
                        "Profile Discord Error:",
                        error.response?.data ||
                        error.message
                    );
                }
            }


            const {
                data:
                    profileRow,

                error:
                    profileError
            } =
                await supabase
                    .from(
                        "user_profiles"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "user_id",
                        userId
                    )
                    .maybeSingle();


            if (profileError) {

                throw profileError;
            }


            if (
                profileRow?.display_name
            ) {

                displayName =
                    profileRow
                        .display_name;

            }

            else if (
                discordMember
            ) {

                displayName =
                    discordMember.nick ||
                    discordMember.user?.global_name ||
                    username;
            }


            req.session.user.displayName =
                displayName;

            req.session.user.username =
                username;

            req.session.user.avatar =
                avatar;


            const {
                data:
                    reportRows,

                error:
                    reportsError
            } =
                await supabase
                    .from(
                        "reports"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "author_id",
                        userId
                    )
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    );


            if (reportsError) {

                throw reportsError;
            }


            const myReports =
                (
                    reportRows ||
                    []
                )
                    .map(
                        mapReport
                    );


            const reportsWithImages =
                myReports.filter(
                    report =>
                        Array.isArray(
                            report.images
                        ) &&
                        report.images.length >
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
                        Array.isArray(
                            profileRow?.duties
                        )

                            ? profileRow.duties
                            : [],

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

        catch (error) {

            console.error(
                "Profile Supabase Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Profilul nu a putut fi încărcat."
                });
        }
    }
);

// ======================================================
// EDITARE PROFILUL MEU
// ======================================================

app.patch(
    "/api/profile",

    requireAuth,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }

        try {

            const userId =
                String(
                    req.session.user.id
                );


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


            const {
                error:
                    profileError
            } =
                await supabase
                    .from(
                        "user_profiles"
                    )
                    .upsert(
                        {
                            user_id:
                                userId,

                            display_name:
                                nickname,

                            duties,

                            updated_at:
                                new Date()
                                    .toISOString()
                        },
                        {
                            onConflict:
                                "user_id"
                        }
                    );


            if (profileError) {

                throw profileError;
            }


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

        catch (error) {

            console.error(
                "Profile Save Supabase Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Profilul nu a putut fi salvat."
                });
        }
    }
);


// ======================================================
// RAPOARTE - UPLOAD SUPABASE STORAGE
// ======================================================

async function uploadReportImages(
    files,
    userId
) {

    const uploadedImages =
        [];

    for (
        const file
        of files
    ) {

        const extension =
            getExtensionFromMime(
                file.mimetype
            );


        const filename =
            `${Date.now()}-${crypto
                .randomBytes(8)
                .toString("hex")}.${extension}`;


        const storagePath =
            `${userId}/${filename}`;


        const {
            error:
                uploadError
        } =
            await supabase
                .storage
                .from(
                    SUPABASE_BUCKET
                )
                .upload(
                    storagePath,
                    file.buffer,
                    {
                        contentType:
                            file.mimetype,

                        cacheControl:
                            "3600",

                        upsert:
                            false
                    }
                );


        if (uploadError) {

            throw uploadError;
        }


        const {
            data:
                publicURLData
        } =
            supabase
                .storage
                .from(
                    SUPABASE_BUCKET
                )
                .getPublicUrl(
                    storagePath
                );


        uploadedImages.push({

            filename,

            path:
                storagePath,

            url:
                publicURLData
                    .publicUrl
        });
    }


    return uploadedImages;
}


// ======================================================
// RAPOARTE - POSTARE
// ======================================================

app.post(
    "/api/reports",

    requireAuth,

    upload.array(
        "images",
        5
    ),

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


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


        let uploadedImages =
            [];


        try {

            uploadedImages =
                await uploadReportImages(
                    req.files ||
                    [],
                    req.session.user.id
                );

            const reportId =
                crypto.randomUUID();


            const now =
                new Date();


            const row = {

                id:
                    reportId,

                author_id:
                    String(
                        req.session.user.id
                    ),

                author_name:
                    req.session.user.displayName ||
                    req.session.user.username,

                author_username:
                    req.session.user.username,

                author_rank:
                    req.session.user.rank,

                author_rank_level:
                    Number(
                        req.session.user.rankLevel ||
                        0
                    ),

                type,

                title,

                description,

                images:
                    uploadedImages,

                created_at:
                    now.toISOString()
            };


            const {
                data:
                    inserted,

                error:
                    insertError
            } =
                await supabase
                    .from(
                        "reports"
                    )
                    .insert(
                        row
                    )
                    .select()
                    .single();


            if (insertError) {

                throw insertError;
            }


            const report =
                mapReport(
                    inserted
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

        catch (error) {

            console.error(
                "Report Supabase Error:",
                error
            );


            if (
                uploadedImages.length
            ) {

                const paths =
                    uploadedImages
                        .map(
                            image =>
                                image.path
                        )
                        .filter(Boolean);


                if (
                    paths.length
                ) {

                    await supabase
                        .storage
                        .from(
                            SUPABASE_BUCKET
                        )
                        .remove(
                            paths
                        );
                }
            }


            res
                .status(500)
                .json({
                    error:
                        "Raportul nu a putut fi salvat în Supabase."
                });
        }
    }
);


// ======================================================
// RAPOARTELE MELE
// ======================================================

app.get(
    "/api/reports/my",

    requireAuth,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "reports"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "author_id",
                        String(
                            req.session.user.id
                        )
                    )
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    );


            if (error) {

                throw error;
            }


            res.json({

                reports:
                    (
                        data ||
                        []
                    )
                        .map(
                            mapReport
                        )
            });

        }

        catch (error) {

            console.error(
                "My Reports Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Rapoartele nu au putut fi încărcate."
                });
        }
    }
);


// ======================================================
// TOATE RAPOARTELE - ADMIN
// ======================================================

app.get(
    "/api/admin/reports",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "reports"
                    )
                    .select(
                        "*"
                    )
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    );


            if (error) {

                throw error;
            }


            const reports =
                (
                    data ||
                    []
                )
                    .map(
                        mapReport
                    );


            res.json({

                success:
                    true,

                total:
                    reports.length,

                reports
            });

        }

        catch (error) {

            console.error(
                "Admin Reports Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Rapoartele nu au putut fi încărcate."
                });
        }
    }
);

// ======================================================
// CONDUCERE - ANUNȚURI DISCORD
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

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            const userId =
                String(
                    req.session.user.id
                );


            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "leave_requests"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "author_id",
                        userId
                    )
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    );


            if (error) {

                throw error;
            }


            const usage =
                await getLeaveUsage(
                    userId
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

                usage,

                requests:
                    (
                        data ||
                        []
                    )
                        .map(
                            mapLeaveRequest
                        )
            });

        }

        catch (error) {

            console.error(
                "Leave Me Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Cererile nu au putut fi încărcate."
                });
        }
    }
);


// ======================================================
// CONCEDII / ÎNVOIRI - CERERE NOUĂ
// ======================================================

app.post(
    "/api/leave",

    requireAuth,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

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
                await getLeaveUsage(
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


            const {
                data:
                    duplicate,

                error:
                    duplicateError
            } =
                await supabase
                    .from(
                        "leave_requests"
                    )
                    .select(
                        "id"
                    )
                    .eq(
                        "author_id",
                        userId
                    )
                    .eq(
                        "status",
                        "PENDING"
                    )
                    .eq(
                        "type",
                        type
                    )
                    .eq(
                        "start_date",
                        startDateRaw
                    )
                    .eq(
                        "end_date",
                        endDateRaw
                    )
                    .limit(1);


            if (
                duplicateError
            ) {

                throw duplicateError;
            }


            if (
                duplicate?.length
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


            const row = {

                id:
                    crypto.randomUUID(),

                author_id:
                    userId,

                author_name:
                    req.session.user.displayName ||
                    req.session.user.username,

                author_username:
                    req.session.user.username,

                author_rank:
                    req.session.user.rank,

                type,

                start_date:
                    startDateRaw,

                end_date:
                    endDateRaw,

                days,

                reason,

                status:
                    "PENDING",

                evaluator_id:
                    null,

                evaluator_name:
                    null,

                evaluator_rank:
                    null,

                decision_note:
                    null,

                decided_at:
                    null,

                cancelled_at:
                    null,

                created_at:
                    now.toISOString()
            };


            const {
                data:
                    inserted,

                error:
                    insertError
            } =
                await supabase
                    .from(
                        "leave_requests"
                    )
                    .insert(
                        row
                    )
                    .select()
                    .single();


            if (
                insertError
            ) {

                throw insertError;
            }


            res
                .status(201)
                .json({

                    success:
                        true,

                    message:
                        "Cererea a fost trimisă spre evaluare.",

                    request:
                        mapLeaveRequest(
                            inserted
                        ),

                    usage:
                        await getLeaveUsage(
                            userId
                        )
                });

        }

        catch (error) {

            console.error(
                "Leave Create Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Cererea nu a putut fi salvată."
                });
        }
    }
);


// ======================================================
// CONCEDII / ÎNVOIRI - ANULARE
// ======================================================

app.patch(
    "/api/leave/:id/cancel",

    requireAuth,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            const requestId =
                String(
                    req.params.id
                );


            const userId =
                String(
                    req.session.user.id
                );


            const {
                data:
                    row,

                error:
                    loadError
            } =
                await supabase
                    .from(
                        "leave_requests"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "id",
                        requestId
                    )
                    .maybeSingle();


            if (
                loadError
            ) {

                throw loadError;
            }


            if (!row) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Cererea nu a fost găsită."
                    });
            }


            if (
                String(
                    row.author_id
                ) !==
                userId
            ) {

                return res
                    .status(403)
                    .json({
                        error:
                            "Nu poți anula cererea altui membru."
                    });
            }


            if (
                row.status !==
                "PENDING"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Poți anula doar cererile aflate în așteptare."
                    });
            }


            const now =
                new Date()
                    .toISOString();


            const {
                data:
                    updated,

                error:
                    updateError
            } =
                await supabase
                    .from(
                        "leave_requests"
                    )
                    .update(
                        {
                            status:
                                "CANCELLED",

                            cancelled_at:
                                now
                        }
                    )
                    .eq(
                        "id",
                        requestId
                    )
                    .select()
                    .single();


            if (
                updateError
            ) {

                throw updateError;
            }


            res.json({

                success:
                    true,

                message:
                    "Cererea a fost anulată.",

                request:
                    mapLeaveRequest(
                        updated
                    )
            });

        }

        catch (error) {

            console.error(
                "Leave Cancel Supabase Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Cererea nu a putut fi anulată."
                });
        }
    }
);

// ======================================================
// CONCEDII / ÎNVOIRI - ADMIN LISTĂ
// ======================================================

app.get(
    "/api/admin/leave",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "leave_requests"
                    )
                    .select(
                        "*"
                    )
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    );


            if (error) {

                throw error;
            }


            const requests =
                (
                    data ||
                    []
                )
                    .map(
                        mapLeaveRequest
                    )
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

        catch (error) {

            console.error(
                "Admin Leave Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Cererile nu au putut fi încărcate."
                });
        }
    }
);


// ======================================================
// CONCEDII / ÎNVOIRI - APROBARE / RESPINGERE
// ======================================================

app.patch(
    "/api/admin/leave/:id/decision",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            const requestId =
                String(
                    req.params.id
                );


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


            const {
                data:
                    row,

                error:
                    loadError
            } =
                await supabase
                    .from(
                        "leave_requests"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "id",
                        requestId
                    )
                    .maybeSingle();


            if (
                loadError
            ) {

                throw loadError;
            }


            if (!row) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Cererea nu a fost găsită."
                    });
            }


            if (
                row.status !==
                "PENDING"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Această cerere a fost deja evaluată."
                    });
            }


            if (
                decision ===
                "APPROVE"
            ) {

                const usage =
                    await getLeaveUsage(
                        row.author_id
                    );


                if (
                    row.type ===
                        "VACATION" &&
                    Number(
                        row.days
                    ) >
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
                    row.type ===
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
                new Date()
                    .toISOString();


            const newStatus =
                decision ===
                "APPROVE"

                    ? "APPROVED"

                    : "REJECTED";


            const {
                data:
                    updated,

                error:
                    updateError
            } =
                await supabase
                    .from(
                        "leave_requests"
                    )
                    .update(
                        {
                            status:
                                newStatus,

                            evaluator_id:
                                String(
                                    req.session.user.id
                                ),

                            evaluator_name:
                                req.session.user.displayName ||
                                req.session.user.username,

                            evaluator_rank:
                                req.session.user.rank,

                            decision_note:
                                note ||
                                null,

                            decided_at:
                                now
                        }
                    )
                    .eq(
                        "id",
                        requestId
                    )
                    .select()
                    .single();


            if (
                updateError
            ) {

                throw updateError;
            }


            res.json({

                success:
                    true,

                message:
                    newStatus ===
                    "APPROVED"

                        ? "Cererea a fost aprobată."

                        : "Cererea a fost respinsă.",

                request:
                    mapLeaveRequest(
                        updated
                    ),

                usage:
                    await getLeaveUsage(
                        updated.author_id
                    )
            });

        }

        catch (error) {

            console.error(
                "Leave Decision Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Cererea nu a putut fi evaluată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - LISTĂ
// ======================================================

app.get(
    "/api/admin/blacklist",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            await updateBlacklistStatuses();


            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "*"
                    )
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    );


            if (error) {

                throw error;
            }


            const entries =
                (
                    data ||
                    []
                )
                    .map(
                        mapBlacklist
                    );


            res.json({

                success:
                    true,

                total:
                    entries.length,

                active:
                    entries.filter(
                        entry =>
                            entry.status ===
                            "ACTIVE"
                    ).length,

                inactive:
                    entries.filter(
                        entry =>
                            entry.status ===
                            "INACTIVE"
                    ).length,

                blacklist:
                    entries
            });

        }

        catch (error) {

            console.error(
                "Blacklist List Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Blacklist-ul nu a putut fi încărcat."
                });
        }
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

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            await updateBlacklistStatuses();


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
                    expiry.getTime() <=
                    Date.now()
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
            }


            const {
                data:
                    existing,

                error:
                    existingError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "id"
                    )
                    .eq(
                        "discord_id",
                        discordId
                    )
                    .eq(
                        "status",
                        "ACTIVE"
                    )
                    .limit(1);


            if (
                existingError
            ) {

                throw existingError;
            }


            if (
                existing?.length
            ) {

                return res
                    .status(409)
                    .json({
                        error:
                            "Acest Discord ID este deja activ în blacklist."
                    });
            }


            const discordUser =
                await getDiscordUserBasic(
                    discordId
                );


            if (
                !name &&
                discordUser?.displayName
            ) {

                name =
                    discordUser.displayName;
            }


            if (!name) {

                name =
                    `Discord ${discordId}`;
            }


            const now =
                new Date()
                    .toISOString();


            const row = {

                id:
                    crypto.randomUUID(),

                discord_id:
                    discordId,

                name,

                username:
                    discordUser?.username ||
                    null,

                avatar:
                    discordUser?.avatar ||
                    null,

                reason,

                duration_type:
                    durationType,

                expires_at:
                    expiresAt,

                status:
                    "ACTIVE",

                added_by_id:
                    String(
                        req.session.user.id
                    ),

                added_by_name:
                    req.session.user.displayName ||
                    req.session.user.username,

                added_by_username:
                    req.session.user.username,

                added_by_rank:
                    req.session.user.rank,

                created_at:
                    now,

                deactivated_at:
                    null,

                deactivated_by_id:
                    null,

                deactivated_by_name:
                    null,

                deactivated_reason:
                    null,

                updated_at:
                    now,

                updated_by_id:
                    String(
                        req.session.user.id
                    ),

                updated_by_name:
                    req.session.user.displayName ||
                    req.session.user.username
            };


            const {
                data:
                    inserted,

                error:
                    insertError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .insert(
                        row
                    )
                    .select()
                    .single();


            if (
                insertError
            ) {

                throw insertError;
            }


            res
                .status(201)
                .json({

                    success:
                        true,

                    message:
                        "Persoana a fost adăugată în blacklist.",

                    entry:
                        mapBlacklist(
                            inserted
                        )
                });

        }

        catch (error) {

            console.error(
                "Blacklist Create Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Persoana nu a putut fi adăugată în blacklist."
                });
        }
    }
);

// ======================================================
// BLACKLIST - CHECK DISCORD ID
// ======================================================

app.get(
    "/api/admin/blacklist/check/:discordId",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            await updateBlacklistStatuses();


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


            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "discord_id",
                        discordId
                    )
                    .eq(
                        "status",
                        "ACTIVE"
                    )
                    .limit(1);


            if (error) {

                throw error;
            }


            const activeEntry =
                data?.length

                    ? mapBlacklist(
                        data[0]
                    )

                    : null;


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

        catch (error) {

            console.error(
                "Blacklist Check Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Verificarea nu a putut fi efectuată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - DETALII
// ======================================================

app.get(
    "/api/admin/blacklist/:id",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            await updateBlacklistStatuses();


            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "id",
                        String(
                            req.params.id
                        )
                    )
                    .maybeSingle();


            if (error) {

                throw error;
            }


            if (!data) {

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

                entry:
                    mapBlacklist(
                        data
                    )
            });

        }

        catch (error) {

            console.error(
                "Blacklist Detail Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Intrarea nu a putut fi încărcată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - EDITARE
// ======================================================

app.patch(
    "/api/admin/blacklist/:id",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            await updateBlacklistStatuses();


            const entryId =
                String(
                    req.params.id
                );


            const {
                data:
                    current,

                error:
                    loadError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "id",
                        entryId
                    )
                    .maybeSingle();


            if (
                loadError
            ) {

                throw loadError;
            }


            if (!current) {

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

                    : current.name;


            const reason =
                req.body.reason !==
                undefined

                    ? String(
                        req.body.reason
                    ).trim()

                    : current.reason;


            const durationType =
                req.body.durationType !==
                undefined

                    ? String(
                        req.body.durationType
                    )
                        .trim()
                        .toUpperCase()

                    : current.duration_type;


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
                current.expires_at;


            if (
                durationType ===
                "PERMANENT"
            ) {

                expiresAt =
                    null;
            }


            if (
                durationType ===
                "TEMPORARY"
            ) {

                const raw =
                    String(
                        req.body.expiresAt ||
                        current.expires_at ||
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
            }


            const {
                data:
                    updated,

                error:
                    updateError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .update(
                        {
                            name,

                            reason,

                            duration_type:
                                durationType,

                            expires_at:
                                expiresAt,

                            updated_at:
                                new Date()
                                    .toISOString(),

                            updated_by_id:
                                String(
                                    req.session.user.id
                                ),

                            updated_by_name:
                                req.session.user.displayName ||
                                req.session.user.username
                        }
                    )
                    .eq(
                        "id",
                        entryId
                    )
                    .select()
                    .single();


            if (
                updateError
            ) {

                throw updateError;
            }


            res.json({

                success:
                    true,

                message:
                    "Intrarea din blacklist a fost actualizată.",

                entry:
                    mapBlacklist(
                        updated
                    )
            });

        }

        catch (error) {

            console.error(
                "Blacklist Update Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Intrarea nu a putut fi actualizată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - DEZACTIVEAZĂ
// ======================================================

app.patch(
    "/api/admin/blacklist/:id/deactivate",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            const entryId =
                String(
                    req.params.id
                );


            const {
                data:
                    current,

                error:
                    loadError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "id",
                        entryId
                    )
                    .maybeSingle();


            if (
                loadError
            ) {

                throw loadError;
            }


            if (!current) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Intrarea din blacklist nu a fost găsită."
                    });
            }


            if (
                current.status ===
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
                new Date()
                    .toISOString();


            const {
                data:
                    updated,

                error:
                    updateError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .update(
                        {
                            status:
                                "INACTIVE",

                            deactivated_at:
                                now,

                            deactivated_by_id:
                                String(
                                    req.session.user.id
                                ),

                            deactivated_by_name:
                                req.session.user.displayName ||
                                req.session.user.username,

                            deactivated_reason:
                                "MANUAL",

                            updated_at:
                                now
                        }
                    )
                    .eq(
                        "id",
                        entryId
                    )
                    .select()
                    .single();


            if (
                updateError
            ) {

                throw updateError;
            }


            res.json({

                success:
                    true,

                message:
                    "Persoana a fost scoasă din blacklist.",

                entry:
                    mapBlacklist(
                        updated
                    )
            });

        }

        catch (error) {

            console.error(
                "Blacklist Deactivate Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Intrarea nu a putut fi dezactivată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - REACTIVEAZĂ
// ======================================================

app.patch(
    "/api/admin/blacklist/:id/reactivate",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            await updateBlacklistStatuses();


            const entryId =
                String(
                    req.params.id
                );


            const {
                data:
                    current,

                error:
                    loadError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "id",
                        entryId
                    )
                    .maybeSingle();


            if (
                loadError
            ) {

                throw loadError;
            }


            if (!current) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Intrarea din blacklist nu a fost găsită."
                    });
            }


            if (
                current.status ===
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
                current.duration_type ===
                    "TEMPORARY" &&
                current.expires_at &&
                new Date(
                    current.expires_at
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


            const {
                data:
                    duplicate,

                error:
                    duplicateError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "id"
                    )
                    .eq(
                        "discord_id",
                        current.discord_id
                    )
                    .eq(
                        "status",
                        "ACTIVE"
                    )
                    .neq(
                        "id",
                        entryId
                    )
                    .limit(1);


            if (
                duplicateError
            ) {

                throw duplicateError;
            }


            if (
                duplicate?.length
            ) {

                return res
                    .status(409)
                    .json({
                        error:
                            "Există deja o intrare activă pentru acest Discord ID."
                    });
            }


            const now =
                new Date()
                    .toISOString();


            const {
                data:
                    updated,

                error:
                    updateError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .update(
                        {
                            status:
                                "ACTIVE",

                            deactivated_at:
                                null,

                            deactivated_by_id:
                                null,

                            deactivated_by_name:
                                null,

                            deactivated_reason:
                                null,

                            updated_at:
                                now,

                            updated_by_id:
                                String(
                                    req.session.user.id
                                ),

                            updated_by_name:
                                req.session.user.displayName ||
                                req.session.user.username
                        }
                    )
                    .eq(
                        "id",
                        entryId
                    )
                    .select()
                    .single();


            if (
                updateError
            ) {

                throw updateError;
            }


            res.json({

                success:
                    true,

                message:
                    "Intrarea a fost reactivată.",

                entry:
                    mapBlacklist(
                        updated
                    )
            });

        }

        catch (error) {

            console.error(
                "Blacklist Reactivate Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Intrarea nu a putut fi reactivată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - ȘTERGE
// ======================================================

app.delete(
    "/api/admin/blacklist/:id",

    requireAdmin,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            const entryId =
                String(
                    req.params.id
                );


            const {
                data:
                    current,

                error:
                    loadError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "id",
                        entryId
                    )
                    .maybeSingle();


            if (
                loadError
            ) {

                throw loadError;
            }


            if (!current) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Intrarea din blacklist nu a fost găsită."
                    });
            }


            const {
                error:
                    deleteError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .delete()
                    .eq(
                        "id",
                        entryId
                    );


            if (
                deleteError
            ) {

                throw deleteError;
            }


            res.json({

                success:
                    true,

                message:
                    `${current.name} a fost șters definitiv din blacklist.`
            });

        }

        catch (error) {

            console.error(
                "Blacklist Delete Supabase Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Intrarea nu a putut fi ștearsă."
                });
        }
    }
);

// ======================================================
// GRADE DIICOT
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


            if (
                error.response?.status ===
                404
            ) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Membrul nu a fost găsit."
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
// ACȚIUNI CONDUCERE - AVANSARE / RETROGRADARE
// Doar COORDONATOR+ prin requireAdmin
// ======================================================

app.patch(
    "/api/admin/members/:userId/rank-step",

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


        const direction =
            String(
                req.body.direction ||
                ""
            )
                .trim()
                .toUpperCase();


        if (
            !/^\d{15,25}$/.test(
                targetUserId
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "ID-ul membrului nu este valid."
                });
        }


        if (
            ![
                "UP",
                "DOWN"
            ].includes(
                direction
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Direcția trebuie să fie UP sau DOWN."
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


            const member =
                memberResponse.data;


            const currentRoles =
                Array.isArray(
                    member.roles
                )

                    ? member.roles
                        .map(String)

                    : [];


            const currentRank =
                getHighestDIICOTRole(
                    currentRoles
                );


            if (!currentRank) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Membrul nu are un grad DIICOT."
                    });
            }


            const targetLevel =
                direction ===
                "UP"

                    ? currentRank.level + 1

                    : currentRank.level - 1;


            const newRank =
                DIICOT_ROLES.find(
                    role =>
                        Number(
                            role.level
                        ) ===
                        Number(
                            targetLevel
                        )
                );


            if (!newRank) {

                if (
                    direction ===
                    "UP"
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                `${currentRank.name} este deja gradul maxim.`
                        });
                }


                return res
                    .status(400)
                    .json({
                        error:
                            `${currentRank.name} este deja gradul minim.`
                    });
            }


            const diicotRoleIds =
                new Set(
                    DIICOT_ROLES.map(
                        role =>
                            String(
                                role.id
                            )
                    )
                );


            const preservedRoles =
                currentRoles.filter(
                    roleId =>
                        !diicotRoleIds.has(
                            String(
                                roleId
                            )
                        )
                );


            const newRoles = [
                ...preservedRoles,
                newRank.id
            ];


            await axios.patch(

                `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${targetUserId}`,

                {
                    roles:
                        newRoles
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

                direction,

                oldRank: {
                    id:
                        currentRank.id,

                    name:
                        currentRank.name,

                    level:
                        currentRank.level
                },

                newRank: {
                    id:
                        newRank.id,

                    name:
                        newRank.name,

                    level:
                        newRank.level
                },

                message:
                    direction ===
                    "UP"

                        ? `Membrul a fost avansat de la ${currentRank.name} la ${newRank.name}.`

                        : `Membrul a fost retrogradat de la ${currentRank.name} la ${newRank.name}.`
            });

        }

        catch (error) {

            console.error(
                "Rank Step Error:",
                error.response?.data ||
                error.message
            );


            if (
                error.response?.status ===
                404
            ) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Membrul nu a fost găsit pe Discord."
                    });
            }


            if (
                error.response?.status ===
                403
            ) {

                return res
                    .status(403)
                    .json({
                        error:
                            "Botul nu poate modifica gradul acestui membru. Verifică ierarhia rolurilor Discord."
                    });
            }


            res
                .status(500)
                .json({
                    error:
                        "Gradul membrului nu a putut fi modificat."
                });
        }
    }
);


// ======================================================
// ACȚIUNI CONDUCERE - SCHIMBĂ INDICATIV
// Format: [D-XX]
// Exemple: [D-01], [D-06], [D-15], [D-99]
// ======================================================

app.patch(
    "/api/admin/members/:userId/callsign",

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


        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        const targetUserId =
            String(
                req.params.userId ||
                ""
            ).trim();


        if (
            !/^\d{15,25}$/.test(
                targetUserId
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "ID-ul membrului nu este valid."
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
                        "Nu îți poți modifica propriul indicativ."
                });
        }


        const rawCallsign =
            String(
                req.body.callsign ||
                ""
            )
                .trim()
                .toUpperCase();


        const match =
            rawCallsign.match(
                /^(?:\[?D-?)?(\d{1,2})\]?$/
            );


        if (!match) {

            return res
                .status(400)
                .json({
                    error:
                        "Indicativ invalid. Folosește un număr între 01 și 99."
                });
        }


        const callsignNumber =
            Number(
                match[1]
            );


        if (
            !Number.isInteger(
                callsignNumber
            ) ||
            callsignNumber < 1 ||
            callsignNumber > 99
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Indicativul trebuie să fie între D-01 și D-99."
                });
        }


        const callsign =
            `D-${String(
                callsignNumber
            ).padStart(
                2,
                "0"
            )}`;


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


            const member =
                memberResponse.data;


            const memberRoles =
                Array.isArray(
                    member.roles
                )

                    ? member.roles.map(
                        String
                    )

                    : [];


            const rank =
                getHighestDIICOTRole(
                    memberRoles
                );


            if (!rank) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Această persoană nu face parte din personalul DIICOT."
                    });
            }


            const {
                data:
                    profileRow,

                error:
                    profileLoadError
            } =
                await supabase
                    .from(
                        "user_profiles"
                    )
                    .select(
                        "display_name,duties"
                    )
                    .eq(
                        "user_id",
                        targetUserId
                    )
                    .maybeSingle();


            if (
                profileLoadError
            ) {

                throw profileLoadError;
            }


            const sourceName =
                profileRow?.display_name ||
                member.nick ||
                member.user?.global_name ||
                member.user?.username ||
                "Membru DIICOT";


            const cleanName =
                String(
                    sourceName
                )
                    .replace(
                        /^\s*\[D-\d{1,3}\]\s*/i,
                        ""
                    )
                    .trim();


            const newNickname =
                `[${callsign}] ${cleanName}`;


            if (
                newNickname.length >
                32
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Numele împreună cu indicativul depășește limita Discord de 32 de caractere."
                    });
            }


            await axios.patch(

                `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${targetUserId}`,

                {
                    nick:
                        newNickname
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


            const {
                error:
                    profileSaveError
            } =
                await supabase
                    .from(
                        "user_profiles"
                    )
                    .upsert(
                        {
                            user_id:
                                targetUserId,

                            display_name:
                                newNickname,

                            duties:
                                Array.isArray(
                                    profileRow?.duties
                                )

                                    ? profileRow.duties

                                    : [],

                            updated_at:
                                new Date()
                                    .toISOString()
                        },
                        {
                            onConflict:
                                "user_id"
                        }
                    );


            if (
                profileSaveError
            ) {

                console.error(
                    "Callsign Profile Save Error:",
                    profileSaveError
                );
            }


            res.json({

                success:
                    true,

                callsign,

                nickname:
                    newNickname,

                message:
                    `Indicativul a fost schimbat în [${callsign}].`
            });

        }

        catch (error) {

            console.error(
                "Callsign Update Error:",
                error.response?.data ||
                error.message ||
                error
            );


            if (
                error.response?.status ===
                404
            ) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Membrul nu a fost găsit pe Discord."
                    });
            }


            if (
                error.response?.status ===
                403
            ) {

                return res
                    .status(403)
                    .json({
                        error:
                            "Botul nu poate schimba nickname-ul acestui membru. Verifică ierarhia rolului botului pe Discord."
                    });
            }


            res
                .status(500)
                .json({
                    error:
                        "Indicativul nu a putut fi modificat."
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

            let members =
                [];

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


            let profileMap =
                new Map();


            if (
                SUPABASE_URL &&
                SUPABASE_SERVICE_KEY
            ) {

                const {
                    data:
                        profileRows,

                    error:
                        profilesError
                } =
                    await supabase
                        .from(
                            "user_profiles"
                        )
                        .select(
                            "*"
                        );


                if (
                    profilesError
                ) {

                    console.error(
                        "Personnel Profile Supabase Error:",
                        profilesError
                    );
                }

                else {

                    profileMap =
                        new Map(
                            (
                                profileRows ||
                                []
                            )
                                .map(
                                    row => [
                                        String(
                                            row.user_id
                                        ),
                                        row
                                    ]
                                )
                        );
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
                    profileMap.get(
                        String(
                            user.id
                        )
                    );


                personnel.push({

                    id:
                        user.id,

                    username:
                        user.username,

                    displayName:
                        saved?.display_name ||
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
                        Array.isArray(
                            saved?.duties
                        )

                            ? saved.duties
                            : []
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
// PROFIL MEMBRU DIICOT
// ======================================================

app.get(
    "/api/profile/:userId",

    requireAuth,

    async (
        req,
        res
    ) => {

        if (
            !ensureSupabase(res)
        ) {
            return;
        }


        try {

            const userId =
                String(
                    req.params.userId ||
                    ""
                ).trim();


            if (
                !/^\d{15,25}$/.test(
                    userId
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "ID-ul membrului nu este valid."
                    });
            }


            if (!BOT_TOKEN) {

                return res
                    .status(500)
                    .json({
                        error:
                            "Botul Discord nu este configurat."
                    });
            }


            let member;


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


                member =
                    response.data;

            }

            catch (error) {

                if (
                    error.response?.status ===
                    404
                ) {

                    return res
                        .status(404)
                        .json({
                            error:
                                "Membrul nu a fost găsit pe serverul Discord."
                        });
                }


                throw error;
            }


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

                return res
                    .status(404)
                    .json({
                        error:
                            "Această persoană nu face parte din personalul DIICOT."
                    });
            }


            const discordUser =
                member.user;


            const {
                data:
                    profileRow,

                error:
                    profileError
            } =
                await supabase
                    .from(
                        "user_profiles"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "user_id",
                        userId
                    )
                    .maybeSingle();


            if (
                profileError
            ) {

                throw profileError;
            }


            const {
                data:
                    reportRows,

                error:
                    reportsError
            } =
                await supabase
                    .from(
                        "reports"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "author_id",
                        userId
                    )
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    );


            if (
                reportsError
            ) {

                throw reportsError;
            }


            const reports =
                (
                    reportRows ||
                    []
                )
                    .map(
                        mapReport
                    );


            const reportsWithImages =
                reports.filter(
                    report =>
                        Array.isArray(
                            report.images
                        ) &&
                        report.images.length >
                        0
                ).length;


            const displayName =
                profileRow?.display_name ||
                member.nick ||
                discordUser.global_name ||
                discordUser.username;


            const avatar =
                discordUser.avatar

                    ? `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.png?size=256`

                    : "https://cdn.discordapp.com/embed/avatars/0.png";


            res.json({

                success:
                    true,

                profile: {

                    id:
                        userId,

                    username:
                        discordUser.username,

                    displayName,

                    avatar,

                    rank:
                        rank.name,

                    rankLevel:
                        rank.level,

                    rankRoleId:
                        rank.id,

                    duties:
                        Array.isArray(
                            profileRow?.duties
                        )

                            ? profileRow.duties

                            : [],

                    statistics: {

                        totalReports:
                            reports.length,

                        reportsWithImages,

                        lastActivity:
                            reports.length

                                ? reports[0]
                                    .createdAtFormatted

                                : "-"
                    },

                    recentActivity:
                        reports
                            .slice(
                                0,
                                10
                            )
                            .map(
                                report => ({

                                    id:
                                        report.id,

                                    type:
                                        report.type,

                                    title:
                                        report.title,

                                    description:
                                        report.description,

                                    images:
                                        report.images,

                                    createdAt:
                                        report.createdAt,

                                    createdAtFormatted:
                                        report.createdAtFormatted
                                })
                            )
                }
            });

        }

        catch (error) {

            console.error(
                "Member Profile Error:",
                error.response?.data ||
                error.message ||
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Profilul membrului nu a putut fi încărcat."
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

    async (
        req,
        res
    ) => {

        let reportsCount =
            null;

        let profilesCount =
            null;

        let blacklistCount =
            null;

        let blacklistActive =
            null;

        let leaveCount =
            null;

        let leavePending =
            null;

        let supabaseOnline =
            false;


        if (
            SUPABASE_URL &&
            SUPABASE_SERVICE_KEY
        ) {

            try {

                await updateBlacklistStatuses();


                const [
                    reportsResult,
                    profilesResult,
                    blacklistResult,
                    blacklistActiveResult,
                    leaveResult,
                    leavePendingResult
                ] =
                    await Promise.all([

                        supabase
                            .from(
                                "reports"
                            )
                            .select(
                                "*",
                                {
                                    count:
                                        "exact",

                                    head:
                                        true
                                }
                            ),

                        supabase
                            .from(
                                "user_profiles"
                            )
                            .select(
                                "*",
                                {
                                    count:
                                        "exact",

                                    head:
                                        true
                                }
                            ),

                        supabase
                            .from(
                                "blacklist"
                            )
                            .select(
                                "*",
                                {
                                    count:
                                        "exact",

                                    head:
                                        true
                                }
                            ),

                        supabase
                            .from(
                                "blacklist"
                            )
                            .select(
                                "*",
                                {
                                    count:
                                        "exact",

                                    head:
                                        true
                                }
                            )
                            .eq(
                                "status",
                                "ACTIVE"
                            ),

                        supabase
                            .from(
                                "leave_requests"
                            )
                            .select(
                                "*",
                                {
                                    count:
                                        "exact",

                                    head:
                                        true
                                }
                            ),

                        supabase
                            .from(
                                "leave_requests"
                            )
                            .select(
                                "*",
                                {
                                    count:
                                        "exact",

                                    head:
                                        true
                                }
                            )
                            .eq(
                                "status",
                                "PENDING"
                            )
                    ]);


                const errors = [
                    reportsResult.error,
                    profilesResult.error,
                    blacklistResult.error,
                    blacklistActiveResult.error,
                    leaveResult.error,
                    leavePendingResult.error
                ]
                    .filter(Boolean);


                if (
                    errors.length
                ) {

                    throw errors[0];
                }


                reportsCount =
                    reportsResult.count;

                profilesCount =
                    profilesResult.count;

                blacklistCount =
                    blacklistResult.count;

                blacklistActive =
                    blacklistActiveResult.count;

                leaveCount =
                    leaveResult.count;

                leavePending =
                    leavePendingResult.count;

                supabaseOnline =
                    true;

            }

            catch (error) {

                console.error(
                    "Health Supabase Error:",
                    error
                );
            }
        }


        res.json({

            status:
                "online",

            service:
                "DIICOT Hub",

            database:
                "Supabase",

            supabaseConfigured:
                Boolean(
                    SUPABASE_URL &&
                    SUPABASE_SERVICE_KEY
                ),

            supabaseOnline,

            storageBucket:
                SUPABASE_BUCKET,

            reports:
                reportsCount,

            profiles:
                profilesCount,

            blacklistTotal:
                blacklistCount,

            blacklistActive,

            leaveRequestsTotal:
                leaveCount,

            leaveRequestsPending:
                leavePending,

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
                true,

            persistentStorage:
                true
        });
    }
);


// ======================================================
// ERROR HANDLER
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
            "===================================="
        );

        console.log(
            "DIICOT HUB ONLINE"
        );

        console.log(
            "PORT:",
            PORT
        );

        console.log(
            "DATABASE:",
            SUPABASE_URL &&
            SUPABASE_SERVICE_KEY

                ? "SUPABASE CONFIGURED"

                : "SUPABASE NOT CONFIGURED"
        );

        console.log(
            "STORAGE:",
            SUPABASE_BUCKET
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
            "BLACKLIST: SUPABASE"
        );

        console.log(
            "CONCEDII / ÎNVOIRI: SUPABASE"
        );

        console.log(
            "RAPOARTE: SUPABASE"
        );

        console.log(
            "BOT:",
            BOT_TOKEN

                ? "CONNECTED"

                : "NOT CONFIGURED"
        );

        console.log(
            "===================================="
        );
    }
);
