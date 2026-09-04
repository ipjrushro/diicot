const express = require("express");
const axios = require("axios");
const cookieSession = require("cookie-session");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    ListObjectVersionsCommand,
    DeleteObjectsCommand
} = require("@aws-sdk/client-s3");

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

const B2_BUCKET = process.env.B2_BUCKET;
const B2_REGION = process.env.B2_REGION;
const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;

const b2 = new S3Client({
    endpoint: B2_ENDPOINT,
    region: B2_REGION,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
        accessKeyId: B2_KEY_ID || "missing-key-id",
        secretAccessKey: B2_APPLICATION_KEY || "missing-application-key"
    }
});

if (
    !B2_BUCKET ||
    !B2_REGION ||
    !B2_ENDPOINT ||
    !B2_KEY_ID ||
    !B2_APPLICATION_KEY
) {
    console.warn(
        "[BACKBLAZE B2] Lipsesc una sau mai multe variabile B2_* din Environment."
    );
}

const ANNOUNCEMENT_CHANNEL_ID = "1528758228450672803";

const VACATION_DAYS_LIMIT = 14;
const MEETING_EXCUSES_LIMIT = 2;
const TESTER_DIICOT_ROLE_ID = "1528758226407919637";

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
        name: "PROCUROR ȘEF DIICOT",
        level: 13
    },
    {
        id: "1528758226420633745",
        name: "PROCUROR ȘEF ADJUNCT DIICOT",
        level: 12
    },
    {
        id: "1528758226420633744",
        name: "PROCUROR DIICOT",
        level: 11
    },
    {
        id: "1528758226416435219",
        name: "COORDONATOR DIICOT",
        level: 10
    },
    {
        id: "1528758226416435217",
        name: "COMISAR ȘEF DIICOT",
        level: 9
    },
    {
        id: "1528758226416435216",
        name: "COMISAR DIICOT",
        level: 8
    },
    {
        id: "1528758226416435215",
        name: "SUB COMISAR DIICOT",
        level: 7
    },
    {
        id: "1528758226416435214",
        name: "INSPECTOR PRINCIPAL DIICOT",
        level: 6
    },
    {
        id: "1528758226416435213",
        name: "INSPECTOR DIICOT",
        level: 5
    },
    {
        id: "1528758226416435211",
        name: "SUB INSPECTOR DIICOT",
        level: 4
    },
    {
        id: "1528758226416435210",
        name: "AGENT PRINCIPAL DIICOT",
        level: 3
    },
    {
        id: "1528758226407919645",
        name: "AGENT OPERATIV DIICOT",
        level: 2
    },
    {
        id: "1528758226407919644",
        name: "AGENT STAGIAR DIICOT",
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
// Rapoartele și pozele rapoartelor merg în Backblaze B2.
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


// ======================================================
// BACKBLAZE B2 - RAPOARTE
// Rapoartele sunt fișiere JSON în B2, iar dovezile foto
// sunt obiecte separate în același bucket privat.
// ======================================================

function ensureB2(res) {
    if (
        !B2_BUCKET ||
        !B2_REGION ||
        !B2_ENDPOINT ||
        !B2_KEY_ID ||
        !B2_APPLICATION_KEY
    ) {
        res.status(503).json({
            error:
                "Backblaze B2 nu este configurat complet pe server."
        });

        return false;
    }

    return true;
}

function encodeB2KeyForURL(key) {
    return String(key || "")
        .split("/")
        .map(encodeURIComponent)
        .join("/");
}

function mapB2Report(report) {
    if (!report) {
        return null;
    }

    const createdAt =
        report.createdAt ||
        report.created_at ||
        new Date().toISOString();

    return {
        id:
            report.id,

        authorId:
            report.authorId ||
            report.author_id,

        authorName:
            report.authorName ||
            report.author_name,

        authorUsername:
            report.authorUsername ||
            report.author_username,

        authorRank:
            report.authorRank ||
            report.author_rank,

        authorRankLevel:
            Number(
                report.authorRankLevel ??
                report.author_rank_level ??
                0
            ),

        type:
            report.type,

        title:
            report.title,

        description:
            report.description,

        images:
            Array.isArray(report.images)
                ? report.images
                : [],

        createdAt,

        createdAtFormatted:
            formatRomanianDate(createdAt)
    };
}

async function b2BodyToString(body) {
    if (!body) {
        return "";
    }

    if (typeof body.transformToString === "function") {
        return body.transformToString("utf-8");
    }

    const chunks = [];

    for await (const chunk of body) {
        chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString("utf-8");
}

async function listB2ObjectKeys(prefix) {
    const keys = [];
    let continuationToken;

    do {
        const response = await b2.send(
            new ListObjectsV2Command({
                Bucket: B2_BUCKET,
                Prefix: prefix,
                ContinuationToken: continuationToken
            })
        );

        for (const object of response.Contents || []) {
            if (object.Key) {
                keys.push(object.Key);
            }
        }

        continuationToken =
            response.IsTruncated
                ? response.NextContinuationToken
                : undefined;

    } while (continuationToken);

    return keys;
}

async function readB2JSON(key) {
    const response = await b2.send(
        new GetObjectCommand({
            Bucket: B2_BUCKET,
            Key: key
        })
    );

    const text = await b2BodyToString(response.Body);
    return JSON.parse(text);
}

async function listB2Reports(authorId = null) {
    const prefix = authorId
        ? `reports/${String(authorId)}/`
        : "reports/";

    const keys = (await listB2ObjectKeys(prefix))
        .filter(key => key.endsWith(".json"));

    const reports = [];

    // Citim pe loturi mici, ca să nu deschidem sute/mii de request-uri simultan.
    const batchSize = 12;

    for (let index = 0; index < keys.length; index += batchSize) {
        const batch = keys.slice(index, index + batchSize);

        const rows = await Promise.all(
            batch.map(async key => {
                try {
                    return mapB2Report(
                        await readB2JSON(key)
                    );
                }
                catch (error) {
                    console.error(
                        "B2 report read error:",
                        key,
                        error.message
                    );

                    return null;
                }
            })
        );

        reports.push(...rows.filter(Boolean));
    }

    reports.sort(
        (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
    );

    return reports;
}

async function listB2ObjectVersions(prefix) {
    const objects = [];
    let keyMarker;
    let versionIdMarker;

    do {
        const response = await b2.send(
            new ListObjectVersionsCommand({
                Bucket: B2_BUCKET,
                Prefix: prefix,
                KeyMarker: keyMarker,
                VersionIdMarker: versionIdMarker
            })
        );

        for (const version of response.Versions || []) {
            if (version.Key && version.VersionId) {
                objects.push({
                    Key: version.Key,
                    VersionId: version.VersionId
                });
            }
        }

        for (const marker of response.DeleteMarkers || []) {
            if (marker.Key && marker.VersionId) {
                objects.push({
                    Key: marker.Key,
                    VersionId: marker.VersionId
                });
            }
        }

        if (response.IsTruncated) {
            keyMarker = response.NextKeyMarker;
            versionIdMarker = response.NextVersionIdMarker;
        } else {
            keyMarker = undefined;
            versionIdMarker = undefined;
        }
    } while (keyMarker);

    return objects;
}

async function deleteB2Objects(objects) {
    const unique = [];
    const seen = new Set();

    for (const object of objects || []) {
        if (!object || !object.Key) continue;
        const item = { Key: String(object.Key) };
        if (object.VersionId) item.VersionId = String(object.VersionId);
        const signature = `${item.Key}::${item.VersionId || ""}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        unique.push(item);
    }

    for (let index = 0; index < unique.length; index += 1000) {
        const batch = unique.slice(index, index + 1000);
        if (!batch.length) continue;

        const response = await b2.send(
            new DeleteObjectsCommand({
                Bucket: B2_BUCKET,
                Delete: { Objects: batch, Quiet: false }
            })
        );

        if (response.Errors && response.Errors.length) {
            throw new Error(
                `B2 delete error: ${response.Errors.map(e => `${e.Key || "?"}: ${e.Code || "Error"} ${e.Message || ""}`).join(" | ")}`
            );
        }
    }
}

async function deleteB2Keys(keys) {
    await deleteB2Objects(
        Array.from(new Set((keys || []).map(String).filter(Boolean)))
            .map(Key => ({ Key }))
    );
}



function mapTestCategory(row) {
    if (!row) return null;

    return {
        id: row.id,
        name: row.name,
        position: Number(row.position || 0)
    };
}


function mapTestQuestion(row) {
    if (!row) return null;

    return {
        id: row.id,
        categoryId: row.category_id,
        question: row.question,
        answer: row.answer,
        position: Number(row.position || 0)
    };
}


function mapTestHistory(row) {
    if (!row) return null;

    return {
        id: row.id,
        candidateName: row.candidate_name,
        candidateDiscord: row.candidate_discord,
        department: row.department,
        testerId: row.tester_id,
        testerName: row.tester_name,
        testerRank: row.tester_rank,
        mistakes: Number(row.mistakes || 0),
        threshold: Number(row.threshold || 0),
        verdict: row.verdict,
        createdAt: row.created_at
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




function getDocsRankForSlot(number) {

    const slot =
        Number(number);

    if (slot === 1) {
        return {
            name: "PROCUROR ȘEF",
            level: 13
        };
    }

    if (slot === 2) {
        return {
            name: "PROCUROR ȘEF ADJUNCT",
            level: 12
        };
    }

    if (slot === 3) {
        return {
            name: "PROCUROR ADJUNCT",
            level: 11
        };
    }

    if (slot >= 4 && slot <= 5) {
        return {
            name: "PROCUROR",
            level: 11
        };
    }

    if (slot >= 6 && slot <= 7) {
        return {
            name: "COORDONATOR",
            level: 10
        };
    }

    if (slot >= 8 && slot <= 10) {
        return {
            name: "COMISAR ȘEF",
            level: 9
        };
    }

    if (slot >= 11 && slot <= 14) {
        return {
            name: "COMISAR",
            level: 8
        };
    }

    if (slot >= 15 && slot <= 19) {
        return {
            name: "SUB-COMISAR",
            level: 7
        };
    }

    if (slot >= 20 && slot <= 24) {
        return {
            name: "INSPECTOR PRINCIPAL",
            level: 6
        };
    }

    if (slot >= 25 && slot <= 28) {
        return {
            name: "INSPECTOR",
            level: 5
        };
    }

    if (slot >= 29 && slot <= 34) {
        return {
            name: "SUB INSPECTOR",
            level: 4
        };
    }

    if (slot >= 35 && slot <= 44) {
        return {
            name: "AGENT PRINCIPAL",
            level: 3
        };
    }

    if (slot >= 45 && slot <= 62) {
        return {
            name: "AGENT OPERATIV",
            level: 2
        };
    }

    if (slot >= 63 && slot <= 99) {
        return {
            name: "AGENT STAGIAR",
            level: 1
        };
    }

    return {
        name: "",
        level: 0
    };
}


function mapDocsRow(row) {

    if (!row) {
        return null;
    }

    return {
        id:
            row.id,

        discordId:
            row.discord_id,

        rank:
            row.rank,

        rankLevel:
            Number(
                row.rank_level ||
                0
            ),

        fullName:
            row.full_name,

        internalId:
            row.internal_id,

        callsign:
            row.callsign,

        active:
            Boolean(
                row.active
            ),

        lastPromotion:
            row.last_promotion,

        joinedAt:
            row.joined_at,

        certFtp:
            Boolean(
                row.cert_ftp
            ),

        certRadio:
            Boolean(
                row.cert_radio
            ),

        certAir:
            Boolean(
                row.cert_air
            ),

        certDcco:
            Boolean(
                row.cert_dcco
            ),

        roles:
            row.roles,

        notes:
            row.notes,

        penaltyPoints:
            Number(
                row.penalty_points ||
                0
            ),

        discord:
            row.discord,

        position:
            Number(
                row.position ||
                0
            ),

        updatedAt:
            row.updated_at,

        updatedByName:
            row.updated_by_name
    };
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


function hasTesterAccess(
    user
) {

    if (!user) {
        return false;
    }

    const roles =
        Array.isArray(
            user.roles
        )
            ? user.roles.map(String)
            : [];

    return (
        Number(
            user.rankLevel ||
            0
        ) >= 10 ||
        roles.includes(
            TESTER_DIICOT_ROLE_ID
        )
    );
}


function requireTester(
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
        !hasTesterAccess(
            req.session.user
        )
    ) {

        return res
            .status(403)
            .json({
                error:
                    "Doar Tester DIICOT sau Conducerea poate accesa testele."
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

            // După autentificarea Discord intrăm direct
            // în Centrul de Comandă.
            res.redirect(
                "/dashboard"
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

    async (
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

        /*
         * Refresh LIVE din Discord.
         * Astfel, dacă îi dai cuiva rolul Tester DIICOT după ce s-a logat,
         * site-ul îl vede fără să depindă de rolurile vechi salvate în sesiune.
         */
        if (
            BOT_TOKEN &&
            GUILD_ID &&
            req.session.user.id
        ) {

            try {

                const memberResponse =
                    await axios.get(
                        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${req.session.user.id}`,
                        {
                            headers: {
                                Authorization:
                                    `Bot ${BOT_TOKEN}`
                            }
                        }
                    );

                const member =
                    memberResponse.data;

                const roles =
                    Array.isArray(
                        member.roles
                    )
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

                req.session.user.displayName =
                    member.nick ||
                    member.user?.global_name ||
                    member.user?.username ||
                    req.session.user.displayName ||
                    req.session.user.username;

            }
            catch (error) {

                console.error(
                    "API ME Discord Refresh Error:",
                    error.response?.data ||
                    error.message
                );
            }
        }

        const roles =
            Array.isArray(
                req.session.user.roles
            )
                ? req.session.user.roles.map(String)
                : [];

        const isAdmin =
            Number(
                req.session.user.rankLevel ||
                0
            ) >= 10;

        const isTester =
            roles.includes(
                "1528758226407919637"
            );

        res.json({
            loggedIn:
                true,

            user:
                req.session.user,

            permissions: {
                admin:
                    isAdmin,

                tester:
                    isTester,

                testManagement:
                    isAdmin ||
                    isTester
            }
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

            const myReports =
                await listB2Reports(
                    userId
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
// RAPOARTE - BACKBLAZE B2
// Metadata: reports/<discordId>/<reportId>.json
// Imagini:  images/<reportId>/<fisier>
// ======================================================

async function uploadReportImagesToB2(
    files,
    reportId
) {
    const uploadedImages = [];

    for (const file of files) {
        const extension =
            getExtensionFromMime(
                file.mimetype
            );

        const filename =
            `${Date.now()}-${crypto
                .randomBytes(8)
                .toString("hex")}.${extension}`;

        const key =
            `images/${reportId}/${filename}`;

        await b2.send(
            new PutObjectCommand({
                Bucket: B2_BUCKET,
                Key: key,
                Body: file.buffer,
                ContentLength: file.buffer.length,
                ContentType: file.mimetype,
                CacheControl: "private, max-age=3600"
            })
        );

        uploadedImages.push({
            filename,
            key,
            path: key,
            provider: "b2",
            url:
                `/api/report-files/${encodeB2KeyForURL(key)}`
        });
    }

    return uploadedImages;
}


// ======================================================
// RAPOARTE - SERVIRE IMAGINI DIN BUCKET-UL PRIVAT B2
// ======================================================

app.get(
    "/api/report-files/*",
    requireAuth,
    async (req, res) => {
        if (!ensureB2(res)) {
            return;
        }

        const key =
            decodeURIComponent(
                String(req.params[0] || "")
            );

        if (
            !key.startsWith("images/") ||
            key.includes("..")
        ) {
            return res.status(400).json({
                error:
                    "Calea fișierului nu este validă."
            });
        }

        try {
            const object = await b2.send(
                new GetObjectCommand({
                    Bucket: B2_BUCKET,
                    Key: key
                })
            );

            if (object.ContentType) {
                res.setHeader(
                    "Content-Type",
                    object.ContentType
                );
            }

            res.setHeader(
                "Cache-Control",
                "private, max-age=3600"
            );

            if (
                object.ContentLength !== undefined
            ) {
                res.setHeader(
                    "Content-Length",
                    String(object.ContentLength)
                );
            }

            if (
                object.Body &&
                typeof object.Body.pipe === "function"
            ) {
                object.Body.pipe(res);
                return;
            }

            const chunks = [];

            for await (const chunk of object.Body || []) {
                chunks.push(Buffer.from(chunk));
            }

            res.end(Buffer.concat(chunks));
        }
        catch (error) {
            const status =
                error?.$metadata?.httpStatusCode === 404 ||
                error?.name === "NoSuchKey"
                    ? 404
                    : 500;

            console.error(
                "B2 report file error:",
                error.message
            );

            res.status(status).json({
                error:
                    status === 404
                        ? "Imaginea nu a fost găsită."
                        : "Imaginea nu a putut fi încărcată."
            });
        }
    }
);


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
    async (req, res) => {
        if (!ensureB2(res)) {
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

        // Descrierea a fost eliminată din formular. Păstrăm câmpul gol
        // în JSON pentru compatibilitate cu rapoartele mai vechi.
        const description = "";

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
            return res.status(400).json({
                error:
                    "Tipul raportului nu este valid."
            });
        }

        if (
            title.length < 2 ||
            title.length > 120
        ) {
            return res.status(400).json({
                error:
                    "Titlul trebuie să aibă între 2 și 120 de caractere."
            });
        }

        const reportId =
            crypto.randomUUID();

        const authorId =
            String(
                req.session.user.id
            );

        const metadataKey =
            `reports/${authorId}/${reportId}.json`;

        let uploadedImages = [];

        try {
            uploadedImages =
                await uploadReportImagesToB2(
                    req.files || [],
                    reportId
                );

            const now =
                new Date().toISOString();

            const report = {
                id:
                    reportId,

                authorId,

                authorName:
                    req.session.user.displayName ||
                    req.session.user.username,

                authorUsername:
                    req.session.user.username,

                authorRank:
                    req.session.user.rank,

                authorRankLevel:
                    Number(
                        req.session.user.rankLevel ||
                        0
                    ),

                type,
                title,
                description,
                images:
                    uploadedImages,
                createdAt:
                    now
            };

            await b2.send(
                new PutObjectCommand({
                    Bucket: B2_BUCKET,
                    Key: metadataKey,
                    Body:
                        JSON.stringify(
                            report,
                            null,
                            2
                        ),
                    ContentType:
                        "application/json; charset=utf-8",
                    CacheControl:
                        "no-store"
                })
            );

            return res.status(201).json({
                success: true,
                message:
                    "Raportul a fost postat în Backblaze B2.",
                report:
                    mapB2Report(report)
            });
        }
        catch (error) {
            console.error(
                "Report Backblaze B2 Error:",
                error
            );

            const cleanupKeys = [
                ...uploadedImages.map(
                    image =>
                        image.key ||
                        image.path
                ),
                metadataKey
            ].filter(Boolean);

            try {
                await deleteB2Keys(
                    cleanupKeys
                );
            }
            catch (cleanupError) {
                console.error(
                    "B2 report cleanup error:",
                    cleanupError.message
                );
            }

            return res.status(500).json({
                error:
                    "Raportul nu a putut fi salvat în Backblaze B2."
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
    async (req, res) => {
        if (!ensureB2(res)) {
            return;
        }

        try {
            const reports =
                await listB2Reports(
                    req.session.user.id
                );

            res.json({
                reports
            });
        }
        catch (error) {
            console.error(
                "My Reports Backblaze B2 Error:",
                error
            );

            res.status(500).json({
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
    async (req, res) => {
        if (!ensureB2(res)) {
            return;
        }

        try {
            const reports =
                await listB2Reports();

            res.json({
                success: true,
                total:
                    reports.length,
                reports
            });
        }
        catch (error) {
            console.error(
                "Admin Reports Backblaze B2 Error:",
                error
            );

            res.status(500).json({
                error:
                    "Rapoartele nu au putut fi încărcate."
            });
        }
    }
);


// ======================================================
// ȘTERGERE GLOBALĂ RAPOARTE - ADMIN
// Șterge atât JSON-urile rapoartelor, cât și imaginile B2.
// Restul datelor din Supabase nu este atins.
// ======================================================

app.delete(
    "/api/admin/reports/all",
    requireAdmin,
    async (req, res) => {
        if (!ensureB2(res)) {
            return;
        }

        if (
            String(
                req.body?.confirmation ||
                ""
            ) !== "STERGE RAPOARTELE"
        ) {
            return res.status(400).json({
                error:
                    "Confirmarea pentru ștergere este invalidă."
            });
        }

        try {
            // B2 păstrează versiuni. Le enumerăm și le ștergem explicit
            // cu VersionId, inclusiv eventualele delete markers.
            const reportVersions = await listB2ObjectVersions("reports/");
            const imageVersions = await listB2ObjectVersions("images/");

            await deleteB2Objects([
                ...imageVersions,
                ...reportVersions
            ]);

            // Verificare finală: ruta nu raportează succes dacă au rămas
            // versiuni/markere sub prefixele de rapoarte.
            const remainingReports = await listB2ObjectVersions("reports/");
            const remainingImages = await listB2ObjectVersions("images/");

            if (remainingReports.length || remainingImages.length) {
                throw new Error(
                    `Au rămas obiecte în B2: reports=${remainingReports.length}, images=${remainingImages.length}`
                );
            }

            console.log(
                `[B2] Ștergere globală completă: ${reportVersions.length} versiuni rapoarte, ${imageVersions.length} versiuni imagini.`
            );

            return res.json({
                success: true,
                deletedReports: reportVersions.filter(
                    item => item.Key.endsWith(".json")
                ).length,
                deletedImages: imageVersions.length,
                message:
                    "Toate rapoartele și toate versiunile imaginilor au fost șterse definitiv din Backblaze B2."
            });
        }
        catch (error) {
            console.error(
                "Delete All Reports B2 Error:",
                error
            );

            return res.status(500).json({
                error:
                    "Rapoartele nu au putut fi șterse complet din Backblaze B2."
            });
        }
    }
);



// ======================================================
// EVENIMENTE + CENTRU NOTIFICĂRI
// ======================================================

app.get("/api/events", requireAuth, async (req, res) => {
    if (!ensureSupabase(res)) return;
    try {
        const { data, error } = await supabase.from("events").select("*").order("event_at", { ascending: true });
        if (error) throw error;
        return res.json({
            events: (data || []).map(row => ({
                id: row.id,
                title: row.title,
                eventAt: row.event_at,
                type: row.type,
                description: row.description || "",
                createdById: row.created_by_id || "",
                createdByName: row.created_by_name || "",
                createdByRank: row.created_by_rank || "",
                createdAt: row.created_at
            }))
        });
    } catch (error) {
        console.error("Events List Error:", error);
        return res.status(500).json({ error: "Evenimentele nu au putut fi încărcate." });
    }
});

app.post("/api/admin/events", requireAdmin, async (req, res) => {
    if (!ensureSupabase(res)) return;
    try {
        const title = String(req.body?.title || "").trim().slice(0, 100);
        const eventAt = String(req.body?.eventAt || "").trim();
        const type = String(req.body?.type || "ALTUL").trim().toUpperCase();
        const description = String(req.body?.description || "").trim().slice(0, 500);
        const allowed = new Set(["SEDINTA","BRIEFING","RAZIE","ANTRENAMENT","ALTUL"]);
        const parsed = new Date(eventAt);

        if (title.length < 2) return res.status(400).json({ error: "Titlul evenimentului este prea scurt." });
        if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: "Data și ora evenimentului sunt invalide." });
        if (!allowed.has(type)) return res.status(400).json({ error: "Tip de eveniment invalid." });

        const row = {
            id: crypto.randomUUID(),
            title,
            event_at: parsed.toISOString(),
            type,
            description,
            created_by_id: String(req.session.user.id),
            created_by_name: req.session.user.displayName || req.session.user.username || "",
            created_by_rank: req.session.user.rank || ""
        };

        const { data, error } = await supabase.from("events").insert(row).select("*").single();
        if (error) throw error;

        return res.status(201).json({
            success: true,
            event: {
                id: data.id,
                title: data.title,
                eventAt: data.event_at,
                type: data.type,
                description: data.description || "",
                createdByName: data.created_by_name || "",
                createdAt: data.created_at
            }
        });
    } catch (error) {
        console.error("Event Create Error:", error);
        return res.status(500).json({ error: "Evenimentul nu a putut fi postat." });
    }
});

app.delete("/api/admin/events/:id", requireAdmin, async (req, res) => {
    if (!ensureSupabase(res)) return;
    try {
        const { error } = await supabase.from("events").delete().eq("id", String(req.params.id || ""));
        if (error) throw error;
        return res.json({ success: true });
    } catch (error) {
        console.error("Event Delete Error:", error);
        return res.status(500).json({ error: "Evenimentul nu a putut fi șters." });
    }
});

app.get("/api/notifications", requireAuth, async (req, res) => {
    if (!ensureSupabase(res)) return;
    try {
        const userId = String(req.session.user.id);
        const oldLimit = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const notifications = [];

        const [eventsResult, complaintsResult, announcementsResult] = await Promise.all([
            supabase.from("events").select("id,title,event_at,type,description,created_at").gte("event_at", oldLimit).order("event_at", { ascending: true }).limit(30),
            supabase.from("complaints").select("id,author_name,reason,status,created_at").eq("target_id", userId).order("created_at", { ascending: false }).limit(30),
            supabase.from("site_announcements").select("id,title,message,author_name,author_rank,created_at").order("created_at", { ascending: false }).limit(30)
        ]);

        if (!eventsResult.error) {
            for (const row of eventsResult.data || []) {
                const dt = new Date(row.event_at);
                const when = Number.isNaN(dt.getTime()) ? "" : dt.toLocaleString("ro-RO", { day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit" });
                notifications.push({
                    id: `event:${row.id}`,
                    type: "EVENT",
                    title: row.type === "SEDINTA" ? `Ședință: ${row.title}` : `Eveniment: ${row.title}`,
                    message: `${when}${row.description ? ` • ${row.description}` : ""}`,
                    createdAt: row.created_at || row.event_at
                });
            }
        } else console.error("Notification Events Error:", eventsResult.error);

        if (!complaintsResult.error) {
            for (const row of complaintsResult.data || []) {
                notifications.push({
                    id: `complaint:${row.id}`,
                    type: "COMPLAINT",
                    title: "Reclamație pe numele tău",
                    message: `${row.author_name ? `Trimisă de ${row.author_name}. ` : ""}${row.reason || "A fost înregistrată o reclamație."}`,
                    createdAt: row.created_at
                });
            }
        } else console.error("Notification Complaints Error:", complaintsResult.error);

        if (!announcementsResult.error) {
            for (const row of announcementsResult.data || []) {
                notifications.push({
                    id: `announcement:${row.id}`,
                    type: "ANNOUNCEMENT",
                    title: row.title || "Anunț conducere",
                    message: `${row.message || ""}${row.author_name ? ` • ${row.author_name}` : ""}`,
                    createdAt: row.created_at
                });
            }
        } else console.error("Notification Announcements Error:", announcementsResult.error);

        notifications.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        return res.json({ notifications: notifications.slice(0,60) });
    } catch (error) {
        console.error("Notifications Error:", error);
        return res.status(500).json({ error: "Notificările nu au putut fi încărcate." });
    }
});


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


            let notificationSaved =
                false;

            try {

                if (supabase) {

                    const {
                        error:
                            saveAnnouncementError
                    } =
                        await supabase
                            .from(
                                "site_announcements"
                            )
                            .insert({
                                id:
                                    crypto.randomUUID(),

                                title,

                                message,

                                author_id:
                                    String(
                                        req.session.user.id
                                    ),

                                author_name:
                                    authorName,

                                author_rank:
                                    authorRank,

                                discord_message_id:
                                    String(
                                        response.data.id ||
                                        ""
                                    )
                            });

                    if (
                        saveAnnouncementError
                    ) {
                        throw saveAnnouncementError;
                    }

                    notificationSaved =
                        true;
                }

            }

            catch (
                saveError
            ) {

                console.error(
                    "Announcement Notification Save Error:",
                    saveError
                );
            }


            res.json({

                success:
                    true,

                message:
                    "Anunțul a fost trimis pe Discord.",

                discordMessageId:
                    response.data.id,

                notificationSaved
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
// CONCEDII / ÎNVOIRI - ANULARE CERERE
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
                    req.params.id ||
                    ""
                ).trim();

            const userId =
                String(
                    req.session.user.id
                );

            const {
                data:
                    existing,

                error:
                    findError
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
                    .eq(
                        "author_id",
                        userId
                    )
                    .maybeSingle();


            if (findError) {
                throw findError;
            }


            if (!existing) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Cererea nu a fost găsită."
                    });
            }


            if (
                existing.status !==
                "PENDING"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Doar cererile aflate în așteptare pot fi anulate."
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
                    .update({

                        status:
                            "CANCELLED",

                        cancelled_at:
                            now

                    })
                    .eq(
                        "id",
                        requestId
                    )
                    .eq(
                        "author_id",
                        userId
                    )
                    .select()
                    .single();


            if (updateError) {
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
                    ),

                usage:
                    await getLeaveUsage(
                        userId
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
// CONCEDII / ÎNVOIRI - ADMINISTRARE
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


            res.json({

                success:
                    true,

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
// CONCEDII / ÎNVOIRI - DECIZIE ADMIN
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
                    req.params.id ||
                    ""
                ).trim();


            const decision =
                String(
                    req.body.decision ||
                    ""
                )
                    .trim()
                    .toUpperCase();


            const decisionNote =
                String(
                    req.body.note ||
                    req.body.decisionNote ||
                    ""
                ).trim();


            if (
                ![
                    "APPROVED",
                    "REJECTED"
                ].includes(
                    decision
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Decizia trebuie să fie APPROVED sau REJECTED."
                    });
            }


            if (
                decisionNote.length >
                1000
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Nota deciziei poate avea maximum 1000 de caractere."
                    });
            }


            const {
                data:
                    existing,

                error:
                    findError
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


            if (findError) {
                throw findError;
            }


            if (!existing) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Cererea nu a fost găsită."
                    });
            }


            if (
                existing.status !==
                "PENDING"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Această cerere a fost deja procesată."
                    });
            }


            if (
                String(
                    existing.author_id
                ) ===
                String(
                    req.session.user.id
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Nu îți poți aproba sau respinge propria cerere."
                    });
            }


            if (
                decision ===
                "APPROVED"
            ) {

                const usage =
                    await getLeaveUsage(
                        existing.author_id
                    );


                if (
                    existing.type ===
                        "VACATION" &&
                    Number(
                        existing.days ||
                        0
                    ) >
                        usage
                            .vacationRemaining
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                "Membrul nu mai are suficiente zile de concediu disponibile."
                        });
                }


                if (
                    existing.type ===
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
                    .update({

                        status:
                            decision,

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
                            decisionNote ||
                            null,

                        decided_at:
                            now

                    })
                    .eq(
                        "id",
                        requestId
                    )
                    .select()
                    .single();


            if (updateError) {
                throw updateError;
            }


            res.json({

                success:
                    true,

                message:
                    decision ===
                    "APPROVED"

                        ? "Cererea a fost aprobată."

                        : "Cererea a fost respinsă.",

                request:
                    mapLeaveRequest(
                        updated
                    ),

                usage:
                    await getLeaveUsage(
                        existing.author_id
                    )
            });

        }

        catch (error) {

            console.error(
                "Admin Leave Decision Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Decizia nu a putut fi salvată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - LISTĂ COMPLETĂ
// DOAR COORDONATOR+
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

                entries
            });

        }

        catch (error) {

            console.error(
                "Blacklist List Error:",
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
// BLACKLIST - VERIFICARE DISCORD ID
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

            const discordId =
                String(
                    req.params.discordId ||
                    ""
                ).trim();


            if (
                !/^\d{17,20}$/.test(
                    discordId
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Discord ID invalid."
                    });
            }


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
                        "discord_id",
                        discordId
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


            const active =
                entries.find(
                    entry =>
                        entry.status ===
                        "ACTIVE"
                ) ||
                null;


            res.json({

                success:
                    true,

                blacklisted:
                    Boolean(active),

                activeEntry:
                    active,

                history:
                    entries
            });

        }

        catch (error) {

            console.error(
                "Blacklist Check Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Verificarea blacklist-ului a eșuat."
                });
        }
    }
);


// ======================================================
// BLACKLIST - DETALII ÎNREGISTRARE
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


            const blacklistId =
                String(
                    req.params.id ||
                    ""
                ).trim();


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
                        blacklistId
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
                            "Înregistrarea nu a fost găsită."
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
                "Blacklist Details Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Înregistrarea nu a putut fi încărcată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - ADĂUGARE
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

            const discordId =
                String(
                    req.body.discordId ||
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
                    ""
                )
                    .trim()
                    .toUpperCase();


            const expiresAtRaw =
                req.body.expiresAt
                    ? String(
                        req.body.expiresAt
                    ).trim()
                    : null;


            if (
                !/^\d{17,20}$/.test(
                    discordId
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Discord ID invalid."
                    });
            }


            if (
                reason.length < 3 ||
                reason.length > 2000
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Motivul trebuie să aibă între 3 și 2000 de caractere."
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
                            "Tipul duratei trebuie să fie PERMANENT sau TEMPORARY."
                    });
            }


            let expiresAt =
                null;


            if (
                durationType ===
                "TEMPORARY"
            ) {

                if (!expiresAtRaw) {

                    return res
                        .status(400)
                        .json({
                            error:
                                "Trebuie să alegi data expirării."
                        });
                }


                const parsed =
                    new Date(
                        expiresAtRaw
                    );


                if (
                    Number.isNaN(
                        parsed.getTime()
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
                    parsed <=
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
                    parsed
                        .toISOString();
            }


            await updateBlacklistStatuses();


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


            if (existingError) {
                throw existingError;
            }


            if (
                existing?.length
            ) {

                return res
                    .status(409)
                    .json({
                        error:
                            "Acest utilizator este deja în blacklist."
                    });
            }


            const discordUser =
                await getDiscordUserBasic(
                    discordId
                );


            const now =
                new Date()
                    .toISOString();


            const row = {

                id:
                    crypto.randomUUID(),

                discord_id:
                    discordId,

                name:
                    discordUser?.displayName ||
                    String(
                        req.body.name ||
                        "Necunoscut"
                    ).trim(),

                username:
                    discordUser?.username ||
                    String(
                        req.body.username ||
                        ""
                    ).trim() ||
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


            if (insertError) {
                throw insertError;
            }


            res
                .status(201)
                .json({

                    success:
                        true,

                    message:
                        "Utilizatorul a fost adăugat în blacklist.",

                    entry:
                        mapBlacklist(
                            inserted
                        )
                });

        }

        catch (error) {

            console.error(
                "Blacklist Create Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Utilizatorul nu a putut fi adăugat în blacklist."
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

            const blacklistId =
                String(
                    req.params.id ||
                    ""
                ).trim();


            const {
                data:
                    existing,

                error:
                    findError
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
                        blacklistId
                    )
                    .maybeSingle();


            if (findError) {
                throw findError;
            }


            if (!existing) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Înregistrarea nu a fost găsită."
                    });
            }


            const reason =
                req.body.reason !==
                undefined

                    ? String(
                        req.body.reason ||
                        ""
                    ).trim()

                    : existing.reason;


            const durationType =
                req.body.durationType !==
                undefined

                    ? String(
                        req.body.durationType ||
                        ""
                    )
                        .trim()
                        .toUpperCase()

                    : existing.duration_type;


            if (
                reason.length < 3 ||
                reason.length > 2000
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Motivul trebuie să aibă între 3 și 2000 de caractere."
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
                existing.expires_at;


            if (
                durationType ===
                "PERMANENT"
            ) {

                expiresAt =
                    null;
            }

            else {

                const expiresAtRaw =
                    req.body.expiresAt !==
                    undefined

                        ? String(
                            req.body.expiresAt ||
                            ""
                        ).trim()

                        : existing.expires_at;


                if (!expiresAtRaw) {

                    return res
                        .status(400)
                        .json({
                            error:
                                "Trebuie să alegi data expirării."
                        });
                }


                const parsed =
                    new Date(
                        expiresAtRaw
                    );


                if (
                    Number.isNaN(
                        parsed.getTime()
                    )
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                "Data expirării nu este validă."
                        });
                }


                expiresAt =
                    parsed
                        .toISOString();
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
                    .update({

                        reason,

                        duration_type:
                            durationType,

                        expires_at:
                            expiresAt,

                        updated_at:
                            now,

                        updated_by_id:
                            String(
                                req.session.user.id
                            ),

                        updated_by_name:
                            req.session.user.displayName ||
                            req.session.user.username

                    })
                    .eq(
                        "id",
                        blacklistId
                    )
                    .select()
                    .single();


            if (updateError) {
                throw updateError;
            }


            res.json({

                success:
                    true,

                message:
                    "Blacklist-ul a fost actualizat.",

                entry:
                    mapBlacklist(
                        updated
                    )
            });

        }

        catch (error) {

            console.error(
                "Blacklist Update Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Înregistrarea nu a putut fi actualizată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - DEZACTIVARE
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

            const blacklistId =
                String(
                    req.params.id ||
                    ""
                ).trim();


            const reason =
                String(
                    req.body.reason ||
                    "Dezactivat manual"
                ).trim();


            const {
                data:
                    existing,

                error:
                    findError
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
                        blacklistId
                    )
                    .maybeSingle();


            if (findError) {
                throw findError;
            }


            if (!existing) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Înregistrarea nu a fost găsită."
                    });
            }


            if (
                existing.status !==
                "ACTIVE"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Această înregistrare nu mai este activă."
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
                    .update({

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
                            reason,

                        updated_at:
                            now,

                        updated_by_id:
                            String(
                                req.session.user.id
                            ),

                        updated_by_name:
                            req.session.user.displayName ||
                            req.session.user.username

                    })
                    .eq(
                        "id",
                        blacklistId
                    )
                    .select()
                    .single();


            if (updateError) {
                throw updateError;
            }


            res.json({

                success:
                    true,

                message:
                    "Înregistrarea a fost dezactivată.",

                entry:
                    mapBlacklist(
                        updated
                    )
            });

        }

        catch (error) {

            console.error(
                "Blacklist Deactivate Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Înregistrarea nu a putut fi dezactivată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - REACTIVARE
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

            const blacklistId =
                String(
                    req.params.id ||
                    ""
                ).trim();


            const {
                data:
                    existing,

                error:
                    findError
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
                        blacklistId
                    )
                    .maybeSingle();


            if (findError) {
                throw findError;
            }


            if (!existing) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Înregistrarea nu a fost găsită."
                    });
            }


            if (
                existing.status ===
                "ACTIVE"
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Înregistrarea este deja activă."
                    });
            }


            const {
                data:
                    activeDuplicate,

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
                        existing.discord_id
                    )
                    .eq(
                        "status",
                        "ACTIVE"
                    )
                    .neq(
                        "id",
                        blacklistId
                    )
                    .limit(1);


            if (duplicateError) {
                throw duplicateError;
            }


            if (
                activeDuplicate?.length
            ) {

                return res
                    .status(409)
                    .json({
                        error:
                            "Există deja o înregistrare activă pentru acest Discord ID."
                    });
            }


            let expiresAt =
                existing.expires_at;


            if (
                existing.duration_type ===
                "TEMPORARY"
            ) {

                const expiresAtRaw =
                    req.body.expiresAt
                        ? String(
                            req.body.expiresAt
                        ).trim()
                        : null;


                if (expiresAtRaw) {

                    const parsed =
                        new Date(
                            expiresAtRaw
                        );


                    if (
                        Number.isNaN(
                            parsed.getTime()
                        )
                    ) {

                        return res
                            .status(400)
                            .json({
                                error:
                                    "Data expirării nu este validă."
                            });
                    }


                    expiresAt =
                        parsed
                            .toISOString();
                }


                if (
                    !expiresAt ||
                    new Date(
                        expiresAt
                    ) <=
                        new Date()
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                "Pentru reactivarea blacklist-ului temporar trebuie setată o dată de expirare în viitor."
                        });
                }
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
                    .update({

                        status:
                            "ACTIVE",

                        expires_at:
                            expiresAt,

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

                    })
                    .eq(
                        "id",
                        blacklistId
                    )
                    .select()
                    .single();


            if (updateError) {
                throw updateError;
            }


            res.json({

                success:
                    true,

                message:
                    "Înregistrarea a fost reactivată.",

                entry:
                    mapBlacklist(
                        updated
                    )
            });

        }

        catch (error) {

            console.error(
                "Blacklist Reactivate Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Înregistrarea nu a putut fi reactivată."
                });
        }
    }
);


// ======================================================
// BLACKLIST - ȘTERGERE DEFINITIVĂ
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

            const blacklistId =
                String(
                    req.params.id ||
                    ""
                ).trim();


            const {
                data:
                    existing,

                error:
                    findError
            } =
                await supabase
                    .from(
                        "blacklist"
                    )
                    .select(
                        "id"
                    )
                    .eq(
                        "id",
                        blacklistId
                    )
                    .maybeSingle();


            if (findError) {
                throw findError;
            }


            if (!existing) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Înregistrarea nu a fost găsită."
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
                        blacklistId
                    );


            if (deleteError) {
                throw deleteError;
            }


            res.json({

                success:
                    true,

                message:
                    "Înregistrarea a fost ștearsă definitiv."
            });

        }

        catch (error) {

            console.error(
                "Blacklist Delete Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Înregistrarea nu a putut fi ștearsă."
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

            const response =
                await axios.get(

                    `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=1000`,

                    {
                        headers: {

                            Authorization:
                                `Bot ${BOT_TOKEN}`
                        }
                    }
                );


            const members =
                Array.isArray(
                    response.data
                )

                    ? response.data

                    : [];


            const personnel =
                members
                    .map(
                        member => {

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
                                return null;
                            }


                            const user =
                                member.user ||
                                {};


                            const avatar =
                                user.avatar

                                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`

                                    : `https://cdn.discordapp.com/embed/avatars/${Number(
                                        BigInt(
                                            user.id ||
                                            "0"
                                        ) >> 22n
                                    ) % 6}.png`;


                            return {

                                id:
                                    String(
                                        user.id
                                    ),

                                username:
                                    user.username ||
                                    "Necunoscut",

                                displayName:
                                    member.nick ||
                                    user.global_name ||
                                    user.username ||
                                    "Necunoscut",

                                avatar,

                                rank:
                                    rank.name,

                                rankLevel:
                                    rank.level,

                                rankRoleId:
                                    rank.id
                            };
                        }
                    )
                    .filter(Boolean)
                    .sort(
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


            const grouped =
                DIICOT_ROLES
                    .map(
                        role => ({

                            id:
                                role.id,

                            name:
                                role.name,

                            level:
                                role.level,

                            members:
                                personnel.filter(
                                    member =>
                                        member.rankRoleId ===
                                        role.id
                                )
                        })
                    )
                    .filter(
                        group =>
                            group.members.length >
                            0
                    );


            res.json({

                success:
                    true,

                total:
                    personnel.length,

                personnel,

                groups:
                    grouped
            });

        }

        catch (error) {

            console.error(
                "Personnel Discord Error:",
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
                !/^\d{17,20}$/.test(
                    userId
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Discord ID invalid."
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
                    .status(403)
                    .json({
                        error:
                            "Acest utilizator nu face parte din structura DIICOT."
                    });
            }


            const discordUser =
                member.user ||
                {};


            const username =
                discordUser.username ||
                "Necunoscut";


            const discordDisplayName =
                member.nick ||
                discordUser.global_name ||
                username;


            const avatar =
                discordUser.avatar

                    ? `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.png?size=256`

                    : `https://cdn.discordapp.com/embed/avatars/${Number(
                        BigInt(
                            userId
                        ) >> 22n
                    ) % 6}.png`;


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


            const displayName =
                profileRow?.display_name ||
                discordDisplayName;


            const duties =
                Array.isArray(
                    profileRow?.duties
                )

                    ? profileRow.duties

                    : [];

            const reports =
                await listB2Reports(
                    userId
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


            const recentActivity =
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
                    );


            const isOwnProfile =
                String(
                    req.session.user.id
                ) ===
                userId;


            const canManage =
                Number(
                    req.session.user.rankLevel ||
                    0
                ) >= 10 &&
                !isOwnProfile;


            res.json({

                success:
                    true,

                profile: {

                    id:
                        userId,

                    username,

                    displayName,

                    discordDisplayName,

                    avatar,

                    rank:
                        rank.name,

                    rankLevel:
                        rank.level,

                    rankRoleId:
                        rank.id,

                    duties,

                    isOwnProfile,

                    canManage,

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

                    reports,

                    recentActivity
                }
            });

        }

        catch (error) {

            console.error(
                "Member Profile Error:",
                error.response?.data ||
                error.message
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
// ADMIN - LISTĂ GRADE DISPONIBILE
// COORDONATOR+ POATE ALEGE ORICARE DIN CELE 13 GRADE
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
// ADMIN - SCHIMBARE GRAD MEMBRU
// Endpoint folosit de formularul "GESTIONEAZĂ GRAD"
// ======================================================

app.patch(
    "/api/admin/members/:userId/role",

    requireAdmin,

    async (
        req,
        res
    ) => {

        const userId =
            String(
                req.params.userId ||
                ""
            ).trim();


        const roleId =
            String(
                req.body.roleId ||
                req.body.rankRoleId ||
                ""
            ).trim();


        if (
            !/^\d{17,20}$/.test(
                userId
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Discord ID invalid."
                });
        }


        if (
            userId ===
            String(
                req.session.user.id
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Nu îți poți modifica propriul grad."
                });
        }


        const targetRole =
            DIICOT_ROLES.find(
                role =>
                    role.id ===
                    roleId
            );


        if (!targetRole) {

            return res
                .status(400)
                .json({
                    error:
                        "Gradul selectat nu este valid."
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


        try {

            const memberResponse =
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
                memberResponse.data;


            const currentRoles =
                Array.isArray(
                    member.roles
                )

                    ? member.roles
                        .map(String)

                    : [];


            const diicotRoleIds =
                new Set(
                    DIICOT_ROLES.map(
                        role =>
                            role.id
                    )
                );


            const preservedRoles =
                currentRoles.filter(
                    roleId =>
                        !diicotRoleIds.has(
                            roleId
                        )
                );


            const newRoles = [
                ...new Set([
                    ...preservedRoles,
                    targetRole.id
                ])
            ];


            await axios.patch(

                `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,

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

                message:
                    `Gradul a fost schimbat în ${targetRole.name}.`,

                rank: {

                    id:
                        targetRole.id,

                    name:
                        targetRole.name,

                    level:
                        targetRole.level
                }
            });

        }

        catch (error) {

            console.error(
                "Admin Change Role Error:",
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
                            "Discord a refuzat modificarea. Verifică dacă rolul botului este deasupra gradelor DIICOT și deasupra membrului."
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
                            "Membrul nu a fost găsit pe Discord."
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
// ADMIN - UP / DOWN EXACT UN GRAD
// ======================================================

app.patch(
    "/api/admin/members/:userId/rank-step",

    requireAdmin,

    async (
        req,
        res
    ) => {

        const userId =
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
            !/^\d{17,20}$/.test(
                userId
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Discord ID invalid."
                });
        }


        if (
            userId ===
            String(
                req.session.user.id
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Nu îți poți modifica propriul grad."
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


        if (!BOT_TOKEN) {

            return res
                .status(500)
                .json({
                    error:
                        "Botul Discord nu este configurat."
                });
        }


        try {

            const memberResponse =
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


            let targetLevel;


            if (
                direction ===
                "UP"
            ) {

                targetLevel =
                    currentRank.level +
                    1;
            }

            else {

                targetLevel =
                    currentRank.level -
                    1;
            }


            const targetRank =
                getDIICOTRoleByLevel(
                    targetLevel
                );


            if (!targetRank) {

                if (
                    direction ===
                    "UP"
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                "Membrul are deja cel mai mare grad DIICOT."
                        });
                }


                return res
                    .status(400)
                    .json({
                        error:
                            "Membrul are deja cel mai mic grad DIICOT."
                    });
            }


            const diicotRoleIds =
                new Set(
                    DIICOT_ROLES.map(
                        role =>
                            role.id
                    )
                );


            const preservedRoles =
                currentRoles.filter(
                    roleId =>
                        !diicotRoleIds.has(
                            roleId
                        )
                );


            const newRoles = [
                ...new Set([
                    ...preservedRoles,
                    targetRank.id
                ])
            ];


            await axios.patch(

                `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,

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

                message:
                    direction ===
                    "UP"

                        ? `Membrul a fost avansat la ${targetRank.name}.`

                        : `Membrul a fost retrogradat la ${targetRank.name}.`,

                previousRank: {

                    id:
                        currentRank.id,

                    name:
                        currentRank.name,

                    level:
                        currentRank.level
                },

                rank: {

                    id:
                        targetRank.id,

                    name:
                        targetRank.name,

                    level:
                        targetRank.level
                }
            });

        }

        catch (error) {

            console.error(
                "Admin Rank Step Error:",
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
                            "Discord a refuzat modificarea gradului. Verifică poziția rolului botului în ierarhia Discord."
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
                            "Membrul nu a fost găsit pe Discord."
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
// ADMIN - SCHIMBARE CALLSIGN
// Format final: [D-XX] Nume
// Exemple:
// 6      -> D-06
// 06     -> D-06
// D-6    -> D-06
// D-06   -> D-06
// [D-06] -> D-06
// ======================================================

app.patch(
    "/api/admin/members/:userId/callsign",

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


        const userId =
            String(
                req.params.userId ||
                ""
            ).trim();


        if (
            !/^\d{17,20}$/.test(
                userId
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Discord ID invalid."
                });
        }


        if (
            userId ===
            String(
                req.session.user.id
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Nu îți poți modifica propriul callsign din această secțiune."
                });
        }


        const callsign =
            normalizeCallsign(
                req.body.callsign
            );


        if (!callsign) {

            return res
                .status(400)
                .json({
                    error:
                        "Callsign invalid. Folosește un număr între 01 și 99."
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


        try {

            const memberResponse =
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


            if (!rank) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Acest utilizator nu face parte din structura DIICOT."
                    });
            }


            const discordUser =
                member.user ||
                {};


            const currentName =
                member.nick ||
                discordUser.global_name ||
                discordUser.username ||
                "Membru";


            const cleanName =
                removeExistingCallsign(
                    currentName
                );


            const newNickname =
                buildCallsignNickname(
                    callsign,
                    cleanName
                );


            if (
                newNickname.length >
                32
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Numele rezultat este prea lung pentru Discord."
                    });
            }


            // ==========================================
            // MODIFICARE NICKNAME PE DISCORD
            // ==========================================

            try {

                await axios.patch(

                    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,

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

            }

            catch (discordError) {

                console.error(
                    "Callsign Discord Error:",
                    discordError.response?.data ||
                    discordError.message
                );


                if (
                    discordError.response?.status ===
                    403
                ) {

                    return res
                        .status(403)
                        .json({
                            error:
                                "Discord a refuzat schimbarea callsign-ului. Verifică dacă rolul botului este deasupra membrului. Nickname-ul ownerului serverului nu poate fi modificat de bot."
                        });
                }


                throw discordError;
            }


            // ==========================================
            // SALVARE ȘI ÎN PROFILUL SITE-ULUI
            // ==========================================

            const {
                data:
                    currentProfile,

                error:
                    profileFindError
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


            if (profileFindError) {

                throw profileFindError;
            }


            const existingDuties =
                Array.isArray(
                    currentProfile?.duties
                )

                    ? currentProfile.duties

                    : [];


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
                                userId,

                            display_name:
                                newNickname,

                            duties:
                                existingDuties,

                            updated_at:
                                new Date()
                                    .toISOString()
                        },
                        {
                            onConflict:
                                "user_id"
                        }
                    );


            if (profileSaveError) {

                throw profileSaveError;
            }


            res.json({

                success:
                    true,

                message:
                    `Callsign-ul a fost schimbat în ${callsign}.`,

                callsign,

                displayName:
                    newNickname,

                member: {

                    id:
                        userId,

                    username:
                        discordUser.username ||
                        "Necunoscut",

                    displayName:
                        newNickname,

                    rank:
                        rank.name,

                    rankLevel:
                        rank.level
                }
            });

        }

        catch (error) {

            console.error(
                "Admin Callsign Error:",
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


            res
                .status(500)
                .json({
                    error:
                        "Callsign-ul nu a putut fi modificat."
                });
        }
    }
);



// ======================================================
// DOCS — REGISTRU PERSONAL
// Vizibil tuturor membrilor autentificați.
// Editare: COORDONATOR+
// ======================================================

app.get(
    "/api/docs",

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
                        "docs_personnel"
                    )
                    .select(
                        "*"
                    )
                    .order(
                        "position",
                        {
                            ascending:
                                true
                        }
                    )
                    .order(
                        "rank_level",
                        {
                            ascending:
                                false
                        }
                    )
                    .order(
                        "full_name",
                        {
                            ascending:
                                true
                        }
                    );

            if (error) {
                throw error;
            }

            res.json({
                success:
                    true,

                canEdit:
                    Number(
                        req.session.user.rankLevel ||
                        0
                    ) >= 10,

                rows:
                    (
                        data ||
                        []
                    )
                        .map(
                            mapDocsRow
                        )
            });

        }

        catch (error) {

            console.error(
                "DOCS List Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Registrul DOCS nu a putut fi încărcat."
                });
        }
    }
);


// ======================================================
// DOCS — ADAUGĂ RÂND
// ======================================================

app.post(
    "/api/admin/docs",

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

            const now =
                new Date()
                    .toISOString();

            const row = {
                id:
                    crypto.randomUUID(),

                discord_id:
                    null,

                rank:
                    "AGENT STAGIAR DIICOT",

                rank_level:
                    1,

                full_name:
                    String(
                        req.body.fullName ||
                        "Membru nou"
                    )
                        .trim()
                        .slice(
                            0,
                            120
                        ),

                internal_id:
                    "",

                callsign:
                    "",

                active:
                    true,

                last_promotion:
                    null,

                joined_at:
                    null,

                cert_ftp:
                    false,

                cert_radio:
                    false,

                cert_air:
                    false,

                cert_dcco:
                    false,

                roles:
                    "",

                notes:
                    "",

                penalty_points:
                    0,

                discord:
                    "",

                position:
                    1000,

                created_at:
                    now,

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
                        "docs_personnel"
                    )
                    .insert(
                        row
                    )
                    .select()
                    .single();

            if (insertError) {
                throw insertError;
            }

            res
                .status(201)
                .json({
                    success:
                        true,

                    row:
                        mapDocsRow(
                            inserted
                        )
                });

        }

        catch (error) {

            console.error(
                "DOCS Create Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Rândul DOCS nu a putut fi creat."
                });
        }
    }
);


// ======================================================
// DOCS — SALVARE TOATE MODIFICĂRILE
// ======================================================

app.patch(
    "/api/admin/docs/bulk",

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

            const rows =
                Array.isArray(
                    req.body?.rows
                )
                    ? req.body.rows
                    : [];

            if (!rows.length) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Nu există modificări de salvat."
                    });
            }

            if (
                rows.length > 150
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Prea multe rânduri într-o singură salvare."
                    });
            }

            const now =
                new Date()
                    .toISOString();

            let updated =
                0;

            for (
                const item
                of rows
            ) {

                const id =
                    String(
                        item.id ||
                        ""
                    ).trim();

                if (!id) {
                    continue;
                }

                const update = {
                    full_name:
                        String(
                            item.fullName ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                120
                            ),

                    internal_id:
                        String(
                            item.internalId ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                40
                            ),

                    callsign:
                        String(
                            item.callsign ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                20
                            ),

                    active:
                        Boolean(
                            item.active
                        ),

                    last_promotion:
                        item.lastPromotion ||
                        null,

                    joined_at:
                        item.joinedAt ||
                        null,

                    cert_ftp:
                        Boolean(
                            item.certFtp
                        ),

                    cert_radio:
                        Boolean(
                            item.certRadio
                        ),

                    cert_air:
                        Boolean(
                            item.certAir
                        ),

                    cert_dcco:
                        Boolean(
                            item.certDcco
                        ),

                    roles:
                        String(
                            item.roles ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                160
                            ),

                    discord:
                        String(
                            item.discord ||
                            ""
                        )
                            .trim()
                            .slice(
                                0,
                                120
                            ),

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
                    error
                } =
                    await supabase
                        .from(
                            "docs_personnel"
                        )
                        .update(
                            update
                        )
                        .eq(
                            "id",
                            id
                        );

                if (error) {
                    throw error;
                }

                updated++;
            }

            const {
                data:
                    refreshedRows,

                error:
                    refreshError
            } =
                await supabase
                    .from(
                        "docs_personnel"
                    )
                    .select(
                        "*"
                    )
                    .order(
                        "position",
                        {
                            ascending:
                                true
                        }
                    )
                    .order(
                        "rank_level",
                        {
                            ascending:
                                false
                        }
                    );

            if (refreshError) {
                throw refreshError;
            }

            res.json({
                success:
                    true,

                updated,

                rows:
                    (
                        refreshedRows ||
                        []
                    )
                        .map(
                            mapDocsRow
                        )
            });

        }

        catch (error) {

            console.error(
                "DOCS Bulk Update Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Modificările DOCS nu au putut fi salvate."
                });
        }
    }
);


// ======================================================
// DOCS — SALVARE RÂND
// ======================================================

app.patch(
    "/api/admin/docs/:id",

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

            const id =
                String(
                    req.params.id ||
                    ""
                ).trim();

            const {
                data:
                    existing,

                error:
                    findError
            } =
                await supabase
                    .from(
                        "docs_personnel"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "id",
                        id
                    )
                    .maybeSingle();

            if (findError) {
                throw findError;
            }

            if (!existing) {

                return res
                    .status(404)
                    .json({
                        error:
                            "Înregistrarea DOCS nu a fost găsită."
                    });
            }

            const payload =
                req.body ||
                {};

            const update = {
                full_name:
                    String(
                        payload.fullName ??
                        existing.full_name ??
                        ""
                    )
                        .trim()
                        .slice(
                            0,
                            120
                        ),

                internal_id:
                    String(
                        payload.internalId ??
                        existing.internal_id ??
                        ""
                    )
                        .trim()
                        .slice(
                            0,
                            40
                        ),

                callsign:
                    String(
                        payload.callsign ??
                        existing.callsign ??
                        ""
                    )
                        .trim()
                        .slice(
                            0,
                            20
                        ),

                active:
                    payload.active ===
                    undefined
                        ? Boolean(
                            existing.active
                        )
                        : Boolean(
                            payload.active
                        ),

                last_promotion:
                    payload.lastPromotion ||
                    null,

                joined_at:
                    payload.joinedAt ||
                    null,

                cert_ftp:
                    payload.certFtp ===
                    undefined
                        ? Boolean(
                            existing.cert_ftp
                        )
                        : Boolean(
                            payload.certFtp
                        ),

                cert_radio:
                    payload.certRadio ===
                    undefined
                        ? Boolean(
                            existing.cert_radio
                        )
                        : Boolean(
                            payload.certRadio
                        ),

                cert_air:
                    payload.certAir ===
                    undefined
                        ? Boolean(
                            existing.cert_air
                        )
                        : Boolean(
                            payload.certAir
                        ),

                cert_dcco:
                    payload.certDcco ===
                    undefined
                        ? Boolean(
                            existing.cert_dcco
                        )
                        : Boolean(
                            payload.certDcco
                        ),

                roles:
                    String(
                        payload.roles ??
                        existing.roles ??
                        ""
                    )
                        .trim()
                        .slice(
                            0,
                            160
                        ),

                notes:
                    String(
                        payload.notes ??
                        existing.notes ??
                        ""
                    )
                        .trim()
                        .slice(
                            0,
                            1500
                        ),

                penalty_points:
                    Math.max(
                        0,
                        Math.min(
                            999,
                            Number(
                                payload.penaltyPoints ??
                                existing.penalty_points ??
                                0
                            ) ||
                            0
                        )
                    ),

                discord:
                    String(
                        payload.discord ??
                        existing.discord ??
                        ""
                    )
                        .trim()
                        .slice(
                            0,
                            120
                        ),

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
            };

            const {
                data:
                    updated,

                error:
                    updateError
            } =
                await supabase
                    .from(
                        "docs_personnel"
                    )
                    .update(
                        update
                    )
                    .eq(
                        "id",
                        id
                    )
                    .select()
                    .single();

            if (updateError) {
                throw updateError;
            }

            res.json({
                success:
                    true,

                row:
                    mapDocsRow(
                        updated
                    )
            });

        }

        catch (error) {

            console.error(
                "DOCS Update Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Înregistrarea DOCS nu a putut fi salvată."
                });
        }
    }
);


// ======================================================
// DOCS — ȘTERGERE
// ======================================================

app.delete(
    "/api/admin/docs/:id",

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

            const id =
                String(
                    req.params.id ||
                    ""
                ).trim();

            const {
                error
            } =
                await supabase
                    .from(
                        "docs_personnel"
                    )
                    .delete()
                    .eq(
                        "id",
                        id
                    );

            if (error) {
                throw error;
            }

            res.json({
                success:
                    true
            });

        }

        catch (error) {

            console.error(
                "DOCS Delete Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Înregistrarea DOCS nu a putut fi ștearsă."
                });
        }
    }
);


// ======================================================
// DOCS — SINCRONIZARE CU PERSONALUL DISCORD
// Creează doar membrii DIICOT care lipsesc.
// Nu suprascrie câmpurile editate manual.
// ======================================================

app.post(
    "/api/admin/docs/sync",

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

        if (!BOT_TOKEN) {

            return res
                .status(500)
                .json({
                    error:
                        "Botul Discord nu este configurat."
                });
        }

        try {

            const now =
                new Date()
                    .toISOString();

            const editorId =
                String(
                    req.session.user.id
                );

            const editorName =
                req.session.user.displayName ||
                req.session.user.username;


            // --------------------------------------------------
            // 1. Citim registrul existent.
            // --------------------------------------------------

            const {
                data:
                    originalRows,

                error:
                    originalError
            } =
                await supabase
                    .from(
                        "docs_personnel"
                    )
                    .select(
                        "*"
                    );

            if (originalError) {
                throw originalError;
            }

            let rows =
                originalRows ||
                [];


            function slotFromCallsign(
                value
            ) {

                const match =
                    String(
                        value ||
                        ""
                    )
                        .trim()
                        .toUpperCase()
                        .match(
                            /^D-(\d{1,2})$/
                        );

                if (!match) {
                    return null;
                }

                const number =
                    Number(
                        match[1]
                    );

                if (
                    number < 1 ||
                    number > 99
                ) {
                    return null;
                }

                return {
                    number,

                    callsign:
                        `D-${String(number).padStart(2, "0")}`
                };
            }


            // --------------------------------------------------
            // 2. Creăm toate sloturile D-01 ... D-99 lipsă.
            // --------------------------------------------------

            const existingCallsigns =
                new Set(
                    rows
                        .map(
                            row =>
                                slotFromCallsign(
                                    row.callsign
                                )?.callsign
                        )
                        .filter(Boolean)
                );

            const slotsToInsert =
                [];

            for (
                let number = 1;
                number <= 99;
                number++
            ) {

                const callsign =
                    `D-${String(number).padStart(2, "0")}`;

                if (
                    existingCallsigns.has(
                        callsign
                    )
                ) {
                    continue;
                }

                const slotRank =
                    getDocsRankForSlot(
                        number
                    );

                slotsToInsert.push({
                    id:
                        crypto.randomUUID(),

                    discord_id:
                        null,

                    rank:
                        slotRank.name,

                    rank_level:
                        slotRank.level,

                    full_name:
                        "",

                    internal_id:
                        "",

                    callsign,

                    active:
                        false,

                    last_promotion:
                        null,

                    joined_at:
                        null,

                    cert_ftp:
                        false,

                    cert_radio:
                        false,

                    cert_air:
                        false,

                    cert_dcco:
                        false,

                    roles:
                        "",

                    notes:
                        "",

                    penalty_points:
                        0,

                    discord:
                        "",

                    position:
                        number,

                    created_at:
                        now,

                    updated_at:
                        now,

                    updated_by_id:
                        editorId,

                    updated_by_name:
                        editorName
                });
            }

            if (
                slotsToInsert.length
            ) {

                const {
                    error:
                        slotInsertError
                } =
                    await supabase
                        .from(
                            "docs_personnel"
                        )
                        .insert(
                            slotsToInsert
                        );

                if (slotInsertError) {
                    throw slotInsertError;
                }
            }


            // Recitim după crearea sloturilor.
            const {
                data:
                    refreshedRows,

                error:
                    refreshedError
            } =
                await supabase
                    .from(
                        "docs_personnel"
                    )
                    .select(
                        "*"
                    );

            if (refreshedError) {
                throw refreshedError;
            }

            rows =
                refreshedRows ||
                [];


            // Orice rând fără callsign valid este pus după D-99.
            const invalidPositionRows =
                rows.filter(
                    row =>
                        !slotFromCallsign(
                            row.callsign
                        ) &&
                        Number(
                            row.position ||
                            0
                        ) < 1000
                );

            for (
                const row
                of invalidPositionRows
            ) {

                await supabase
                    .from(
                        "docs_personnel"
                    )
                    .update({
                        position:
                            1000,

                        updated_at:
                            now
                    })
                    .eq(
                        "id",
                        row.id
                    );
            }


            // --------------------------------------------------
            // 2.1 Actualizăm gradul fiecărui slot D-01 ... D-99
            // după schema fixă DOCS.
            // --------------------------------------------------

            const {
                data:
                    allSlotRows,

                error:
                    allSlotRowsError
            } =
                await supabase
                    .from(
                        "docs_personnel"
                    )
                    .select(
                        "id, callsign"
                    );

            if (allSlotRowsError) {
                throw allSlotRowsError;
            }

            for (
                const row
                of allSlotRows || []
            ) {

                const slot =
                    slotFromCallsign(
                        row.callsign
                    );

                if (!slot) {
                    continue;
                }

                const docsRank =
                    getDocsRankForSlot(
                        slot.number
                    );

                const {
                    error:
                        rankUpdateError
                } =
                    await supabase
                        .from(
                            "docs_personnel"
                        )
                        .update({
                            rank:
                                docsRank.name,

                            rank_level:
                                docsRank.level,

                            position:
                                slot.number,

                            updated_at:
                                now
                        })
                        .eq(
                            "id",
                            row.id
                        );

                if (rankUpdateError) {
                    throw rankUpdateError;
                }
            }


            // --------------------------------------------------
            // 3. Luăm membrii DIICOT din Discord.
            // --------------------------------------------------

            const memberResponse =
                await axios.get(

                    `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=1000`,

                    {
                        headers: {
                            Authorization:
                                `Bot ${BOT_TOKEN}`
                        }
                    }
                );

            const members =
                Array.isArray(
                    memberResponse.data
                )
                    ? memberResponse.data
                    : [];


            let assigned =
                0;

            let merged =
                0;


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

                const discordId =
                    String(
                        member.user?.id ||
                        ""
                    );

                if (!discordId) {
                    continue;
                }

                const displayName =
                    member.nick ||
                    member.user?.global_name ||
                    member.user?.username ||
                    "Membru DIICOT";

                const callsignMatch =
                    displayName.match(
                        /\[(D-\d{1,2})\]/i
                    );

                if (!callsignMatch) {
                    continue;
                }

                const slot =
                    slotFromCallsign(
                        callsignMatch[1]
                    );

                if (!slot) {
                    continue;
                }

                rows =
                    (
                        await supabase
                            .from(
                                "docs_personnel"
                            )
                            .select(
                                "*"
                            )
                    ).data ||
                    rows;

                const target =
                    rows.find(
                        row =>
                            slotFromCallsign(
                                row.callsign
                            )?.callsign ===
                            slot.callsign
                    );

                if (!target) {
                    continue;
                }

                const oldDiscordRow =
                    rows.find(
                        row =>
                            String(
                                row.discord_id ||
                                ""
                            ) ===
                            discordId &&
                            row.id !==
                            target.id
                    );


                // Dacă vechiul sync crease un rând separat pentru membru,
                // mutăm datele manuale în slotul său și ștergem duplicatul.
                let manualSource =
                    target;

                if (oldDiscordRow) {

                    manualSource = {
                        ...target,

                        internal_id:
                            target.internal_id ||
                            oldDiscordRow.internal_id ||
                            "",

                        last_promotion:
                            target.last_promotion ||
                            oldDiscordRow.last_promotion ||
                            null,

                        joined_at:
                            target.joined_at ||
                            oldDiscordRow.joined_at ||
                            null,

                        cert_ftp:
                            Boolean(
                                target.cert_ftp ||
                                oldDiscordRow.cert_ftp
                            ),

                        cert_radio:
                            Boolean(
                                target.cert_radio ||
                                oldDiscordRow.cert_radio
                            ),

                        cert_air:
                            Boolean(
                                target.cert_air ||
                                oldDiscordRow.cert_air
                            ),

                        cert_dcco:
                            Boolean(
                                target.cert_dcco ||
                                oldDiscordRow.cert_dcco
                            ),

                        roles:
                            target.roles ||
                            oldDiscordRow.roles ||
                            "",

                        notes:
                            target.notes ||
                            oldDiscordRow.notes ||
                            "",

                        penalty_points:
                            Number(
                                target.penalty_points ||
                                oldDiscordRow.penalty_points ||
                                0
                            )
                    };

                    const {
                        error:
                            deleteDuplicateError
                    } =
                        await supabase
                            .from(
                                "docs_personnel"
                            )
                            .delete()
                            .eq(
                                "id",
                                oldDiscordRow.id
                            );

                    if (deleteDuplicateError) {
                        throw deleteDuplicateError;
                    }

                    merged++;
                }


                const docsSlotRank =
                    getDocsRankForSlot(
                        slot.number
                    );

                const {
                    error:
                        assignError
                } =
                    await supabase
                        .from(
                            "docs_personnel"
                        )
                        .update({
                            discord_id:
                                discordId,

                            rank:
                                docsSlotRank.name,

                            rank_level:
                                docsSlotRank.level,

                            full_name:
                                removeExistingCallsign(
                                    displayName
                                ),

                            internal_id:
                                manualSource.internal_id ||
                                "",

                            callsign:
                                slot.callsign,

                            active:
                                true,

                            last_promotion:
                                manualSource.last_promotion ||
                                null,

                            joined_at:
                                manualSource.joined_at ||
                                null,

                            cert_ftp:
                                Boolean(
                                    manualSource.cert_ftp
                                ),

                            cert_radio:
                                Boolean(
                                    manualSource.cert_radio
                                ),

                            cert_air:
                                Boolean(
                                    manualSource.cert_air
                                ),

                            cert_dcco:
                                Boolean(
                                    manualSource.cert_dcco
                                ),

                            roles:
                                manualSource.roles ||
                                "",

                            notes:
                                manualSource.notes ||
                                "",

                            penalty_points:
                                Number(
                                    manualSource.penalty_points ||
                                    0
                                ),

                            discord:
                                member.user?.username
                                    ? `@${member.user.username}`
                                    : discordId,

                            position:
                                slot.number,

                            updated_at:
                                now,

                            updated_by_id:
                                editorId,

                            updated_by_name:
                                editorName
                        })
                        .eq(
                            "id",
                            target.id
                        );

                if (assignError) {
                    throw assignError;
                }

                assigned++;
            }


            res.json({
                success:
                    true,

                created:
                    slotsToInsert.length,

                assigned,

                merged,

                totalSlots:
                    99
            });

        }

        catch (error) {

            console.error(
                "DOCS Sync Error:",
                error.response?.data ||
                error.message
            );

            res
                .status(500)
                .json({
                    error:
                        "Personalul DOCS nu a putut fi sincronizat."
                });
        }
    }
);



// ======================================================
// ACTIVITĂȚI — CERERI CALLSIGN
// ======================================================

function mapCallsignRequest(row) {
    if (!row) return null;

    return {
        id: row.id,
        authorId: row.author_id,
        authorName: row.author_name,
        authorUsername: row.author_username,
        authorRank: row.author_rank,
        gameId: row.game_id || "",
        gameName: row.game_name || "",
        note: row.note || "",
        status: row.status || "PENDING",
        assignedCallsign: row.assigned_callsign || null,
        decidedById: row.decided_by_id || null,
        decidedByName: row.decided_by_name || null,
        decidedByRank: row.decided_by_rank || null,
        decisionNote: row.decision_note || "",
        createdAt: row.created_at,
        decidedAt: row.decided_at
    };
}


async function sendDiscordDM(userId, content) {
    if (!BOT_TOKEN) {
        throw new Error("Botul Discord nu este configurat.");
    }

    const dmResponse = await axios.post(
        "https://discord.com/api/v10/users/@me/channels",
        {
            recipient_id: String(userId)
        },
        {
            headers: {
                Authorization: `Bot ${BOT_TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );

    await axios.post(
        `https://discord.com/api/v10/channels/${dmResponse.data.id}/messages`,
        {
            content: String(content).slice(0, 1900),
            allowed_mentions: {
                parse: []
            }
        },
        {
            headers: {
                Authorization: `Bot ${BOT_TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );
}


// ======================================================
// SANCȚIUNI — ROLURI FW + CANAL INFO-SANCTIUNI
// ======================================================

const FACTION_WARN_ROLE_IDS = {
    1: "1528758226319966342",
    2: "1528758226319966343",
    3: "1528758226319966344",
    4: "1528758226319966345",
    5: "1528758226319966346"
};

const INFO_SANCTIONS_CHANNEL_ID = "1544679685030682664";

async function syncFactionWarnDiscordRole(userId, level) {
    if (!BOT_TOKEN || !GUILD_ID) {
        throw new Error("Botul Discord sau serverul Discord nu este configurat.");
    }

    const desiredLevel = Math.max(0, Math.min(5, Number(level) || 0));
    const desiredRoleId = desiredLevel > 0 ? FACTION_WARN_ROLE_IDS[desiredLevel] : null;

    const memberResponse = await axios.get(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
        {
            headers: {
                Authorization: `Bot ${BOT_TOKEN}`
            }
        }
    );

    const currentRoles = new Set((memberResponse.data?.roles || []).map(String));
    const allFwRoleIds = Object.values(FACTION_WARN_ROLE_IDS);

    // Scoate orice rol FW vechi, cu excepția celui care trebuie păstrat.
    for (const roleId of allFwRoleIds) {
        if (currentRoles.has(roleId) && roleId !== desiredRoleId) {
            await axios.delete(
                `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`,
                {
                    headers: {
                        Authorization: `Bot ${BOT_TOKEN}`
                    }
                }
            );
        }
    }

    // Aplică rolul corespunzător nivelului curent.
    if (desiredRoleId && !currentRoles.has(desiredRoleId)) {
        await axios.put(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${desiredRoleId}`,
            {},
            {
                headers: {
                    Authorization: `Bot ${BOT_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );
    }

    return {
        level: desiredLevel,
        roleId: desiredRoleId
    };
}

async function sendSanctionInfoMessage({
    targetId,
    targetName,
    type,
    fwCount,
    activeFw,
    reason,
    appliedByName,
    appliedByRank
}) {
    if (!BOT_TOKEN || !INFO_SANCTIONS_CHANNEL_ID) {
        throw new Error("Canalul info-sanctiuni sau botul Discord nu este configurat.");
    }

    const isOut = type === "OUT";
    const displayedLevel = isOut ? 5 : activeFw;
    const title = isOut
        ? "🔴 Sancțiune aplicată — OUT"
        : `🟡 Sancțiune aplicată — Faction Warn ${displayedLevel}/5`;

    const embed = {
        title,
        color: isOut ? 0xED4245 : 0xF0B232,
        fields: [
            {
                name: "Membru",
                value: `${targetName || "Necunoscut"}\n<@${targetId}>`,
                inline: true
            },
            {
                name: "Tip sancțiune",
                value: isOut ? "OUT" : `FACTION WARN (+${fwCount})`,
                inline: true
            },
            {
                name: "Situație FW",
                value: isOut ? "5/5 — OUT" : `${activeFw}/5 FW`,
                inline: true
            },
            {
                name: "Motiv",
                value: String(reason || "-" ).slice(0, 1000),
                inline: false
            },
            {
                name: "Aplicată de",
                value: `${appliedByName || "Conducerea DIICOT"}\n${appliedByRank || "CONDUCERE DIICOT"}`,
                inline: true
            }
        ],
        footer: {
            text: "DIICOT • Sistem sancțiuni"
        },
        timestamp: new Date().toISOString()
    };

    await axios.post(
        `https://discord.com/api/v10/channels/${INFO_SANCTIONS_CHANNEL_ID}/messages`,
        {
            embeds: [embed],
            allowed_mentions: {
                parse: []
            }
        },
        {
            headers: {
                Authorization: `Bot ${BOT_TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );
}


// Toți membrii autentificați își pot vedea cererile.
app.get(
    "/api/callsign-requests/me",
    requireAuth,
    async (req, res) => {
        if (!ensureSupabase(res)) return;

        try {
            const { data, error } =
                await supabase
                    .from("callsign_requests")
                    .select("*")
                    .eq("author_id", String(req.session.user.id))
                    .order("created_at", { ascending: false })
                    .limit(50);

            if (error) throw error;

            return res.json({
                requests: (data || []).map(mapCallsignRequest)
            });
        }
        catch (error) {
            console.error("Callsign Requests Me Error:", error);
            return res.status(500).json({
                error: "Cererile de callsign nu au putut fi încărcate."
            });
        }
    }
);


// Orice membru autentificat poate depune o cerere.
// Maximum o cerere PENDING simultan.
app.post(
    "/api/callsign-requests",
    requireAuth,
    async (req, res) => {
        if (!ensureSupabase(res)) return;

        try {
            const gameId =
                String(req.body?.gameId || "")
                    .trim()
                    .slice(0, 20);

            const gameName =
                String(req.body?.gameName || "")
                    .trim()
                    .slice(0, 80);

            const note =
                String(req.body?.note || "")
                    .trim()
                    .slice(0, 700);

            if (!gameId || !gameName) {
                return res.status(400).json({
                    error: "Completează ID-ul din joc și numele după joc."
                });
            }

            if (!/^\d{1,20}$/.test(gameId)) {
                return res.status(400).json({
                    error: "ID-ul din joc trebuie să conțină doar cifre."
                });
            }

            const { data: pending, error: pendingError } =
                await supabase
                    .from("callsign_requests")
                    .select("id")
                    .eq("author_id", String(req.session.user.id))
                    .eq("status", "PENDING")
                    .limit(1);

            if (pendingError) throw pendingError;

            if ((pending || []).length) {
                return res.status(409).json({
                    error: "Ai deja o cerere de callsign în așteptare."
                });
            }

            const row = {
                id: crypto.randomUUID(),
                author_id: String(req.session.user.id),
                author_name:
                    req.session.user.displayName ||
                    req.session.user.username ||
                    "Membru",
                author_username:
                    req.session.user.username || "",
                author_rank:
                    req.session.user.rank || "",
                game_id: gameId,
                game_name: gameName,
                note,
                status: "PENDING"
            };

            const { data, error } =
                await supabase
                    .from("callsign_requests")
                    .insert(row)
                    .select("*")
                    .single();

            if (error) throw error;

            return res.status(201).json({
                success: true,
                request: mapCallsignRequest(data)
            });
        }
        catch (error) {
            console.error("Callsign Request Create Error:", error);
            return res.status(500).json({
                error: "Cererea de callsign nu a putut fi trimisă."
            });
        }
    }
);


// COORDONATOR+ vede toate cererile.
app.get(
    "/api/admin/callsign-requests",
    requireAdmin,
    async (req, res) => {
        if (!ensureSupabase(res)) return;

        try {
            const { data, error } =
                await supabase
                    .from("callsign_requests")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(300);

            if (error) throw error;

            return res.json({
                requests: (data || []).map(mapCallsignRequest)
            });
        }
        catch (error) {
            console.error("Admin Callsign Requests Error:", error);
            return res.status(500).json({
                error: "Cererile de callsign nu au putut fi încărcate."
            });
        }
    }
);


// COORDONATOR+ aprobă și acordă callsign-ul.
// Se actualizează Discord nickname + profil + DOCS (dacă există rând pentru discord_id).
app.patch(
    "/api/admin/callsign-requests/:id/approve",
    requireAdmin,
    async (req, res) => {
        if (!ensureSupabase(res)) return;

        const requestId = String(req.params.id || "").trim();
        const callsign = normalizeCallsign(req.body?.callsign);

        if (!requestId || !callsign) {
            return res.status(400).json({
                error: "Cererea sau callsign-ul este invalid. Folosește D-01 până la D-99."
            });
        }

        try {
            const { data: requestRow, error: requestError } =
                await supabase
                    .from("callsign_requests")
                    .select("*")
                    .eq("id", requestId)
                    .maybeSingle();

            if (requestError) throw requestError;

            if (!requestRow) {
                return res.status(404).json({
                    error: "Cererea nu a fost găsită."
                });
            }

            if (requestRow.status !== "PENDING") {
                return res.status(409).json({
                    error: "Această cerere a fost deja soluționată."
                });
            }

            const targetId = String(requestRow.author_id);

            // Verificăm dacă callsign-ul este deja ocupat în DOCS.
            const { data: occupiedRows, error: occupiedError } =
                await supabase
                    .from("docs_personnel")
                    .select("id, discord_id, callsign")
                    .eq("callsign", callsign)
                    .limit(5);

            if (occupiedError) throw occupiedError;

            const occupiedByOther =
                (occupiedRows || []).find(
                    row =>
                        row.discord_id &&
                        String(row.discord_id) !== targetId
                );

            if (occupiedByOther) {
                return res.status(409).json({
                    error: `${callsign} este deja ocupat în DOCS.`
                });
            }

            if (!BOT_TOKEN) {
                return res.status(500).json({
                    error: "Botul Discord nu este configurat."
                });
            }

            const memberResponse =
                await axios.get(
                    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${targetId}`,
                    {
                        headers: {
                            Authorization: `Bot ${BOT_TOKEN}`
                        }
                    }
                );

            const member = memberResponse.data;
            const roles =
                Array.isArray(member.roles)
                    ? member.roles.map(String)
                    : [];

            const rank = getHighestDIICOTRole(roles);

            if (!rank) {
                return res.status(400).json({
                    error: "Membrul nu mai face parte din structura DIICOT."
                });
            }

            const discordUser = member.user || {};
            const currentName =
                member.nick ||
                discordUser.global_name ||
                discordUser.username ||
                requestRow.author_name ||
                "Membru";

            const newNickname =
                buildCallsignNickname(
                    callsign,
                    removeExistingCallsign(currentName)
                );

            if (newNickname.length > 32) {
                return res.status(400).json({
                    error: "Nickname-ul rezultat este prea lung pentru Discord."
                });
            }

            try {
                await axios.patch(
                    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${targetId}`,
                    {
                        nick: newNickname
                    },
                    {
                        headers: {
                            Authorization: `Bot ${BOT_TOKEN}`,
                            "Content-Type": "application/json"
                        }
                    }
                );
            }
            catch (discordError) {
                console.error(
                    "Callsign Request Discord Nick Error:",
                    discordError.response?.data || discordError.message
                );

                if (discordError.response?.status === 403) {
                    return res.status(403).json({
                        error: "Discord a refuzat schimbarea nickname-ului. Rolul botului trebuie să fie deasupra membrului."
                    });
                }

                throw discordError;
            }

            // Profil site — păstrăm duties existente.
            const { data: profile } =
                await supabase
                    .from("user_profiles")
                    .select("*")
                    .eq("user_id", targetId)
                    .maybeSingle();

            const duties =
                Array.isArray(profile?.duties)
                    ? profile.duties
                    : [];

            const { error: profileError } =
                await supabase
                    .from("user_profiles")
                    .upsert(
                        {
                            user_id: targetId,
                            display_name: newNickname,
                            duties,
                            updated_at: new Date().toISOString()
                        },
                        {
                            onConflict: "user_id"
                        }
                    );

            if (profileError) throw profileError;

            // DOCS — actualizăm DOAR rândul membrului; nu resetăm și nu ștergem nimic.
            const { data: docsRows, error: docsFindError } =
                await supabase
                    .from("docs_personnel")
                    .select("*")
                    .eq("discord_id", targetId)
                    .limit(1);

            if (docsFindError) throw docsFindError;

            if ((docsRows || []).length) {
                const docsRow = docsRows[0];

                const { error: docsUpdateError } =
                    await supabase
                        .from("docs_personnel")
                        .update({
                            callsign,
                            full_name:
                                docsRow.full_name ||
                                removeExistingCallsign(newNickname),
                            updated_at: new Date().toISOString(),
                            updated_by_id: String(req.session.user.id),
                            updated_by_name:
                                req.session.user.displayName ||
                                req.session.user.username
                        })
                        .eq("id", docsRow.id);

                if (docsUpdateError) throw docsUpdateError;
            }

            const now = new Date().toISOString();

            const { error: decisionError } =
                await supabase
                    .from("callsign_requests")
                    .update({
                        status: "APPROVED",
                        assigned_callsign: callsign,
                        decided_by_id: String(req.session.user.id),
                        decided_by_name:
                            req.session.user.displayName ||
                            req.session.user.username,
                        decided_by_rank:
                            req.session.user.rank || "",
                        decision_note:
                            String(req.body?.decisionNote || "")
                                .trim()
                                .slice(0, 500),
                        decided_at: now,
                        updated_at: now
                    })
                    .eq("id", requestId);

            if (decisionError) throw decisionError;

            let dmSent = true;

            try {
                await sendDiscordDM(
                    targetId,
                    `📟 CERERE CALLSIGN APROBATĂ\n\nAi primit callsign-ul **${callsign}**.\nAi la dispoziție **24 de ore** să îl folosești și să respecți formatul stabilit de conducerea DIICOT. Dacă nu respecți această obligație în termenul de 24 de ore, poți primi sancțiune conform regulamentului intern.\n\nAcordat de: **${req.session.user.displayName || req.session.user.username}**`
                );
            }
            catch (dmError) {
                dmSent = false;
                console.error(
                    "Callsign Request DM Error:",
                    dmError.response?.data || dmError.message
                );
            }

            return res.json({
                success: true,
                callsign,
                displayName: newNickname,
                dmSent
            });
        }
        catch (error) {
            console.error(
                "Callsign Request Approve Error:",
                error.response?.data || error
            );

            return res.status(500).json({
                error: "Callsign-ul nu a putut fi acordat."
            });
        }
    }
);


// COORDONATOR+ poate respinge cererea.
app.patch(
    "/api/admin/callsign-requests/:id/reject",
    requireAdmin,
    async (req, res) => {
        if (!ensureSupabase(res)) return;

        try {
            const requestId = String(req.params.id || "").trim();
            const reason =
                String(req.body?.reason || "")
                    .trim()
                    .slice(0, 500);

            const { data: requestRow, error: findError } =
                await supabase
                    .from("callsign_requests")
                    .select("*")
                    .eq("id", requestId)
                    .maybeSingle();

            if (findError) throw findError;

            if (!requestRow) {
                return res.status(404).json({
                    error: "Cererea nu a fost găsită."
                });
            }

            if (requestRow.status !== "PENDING") {
                return res.status(409).json({
                    error: "Această cerere a fost deja soluționată."
                });
            }

            const now = new Date().toISOString();

            const { error } =
                await supabase
                    .from("callsign_requests")
                    .update({
                        status: "REJECTED",
                        decided_by_id: String(req.session.user.id),
                        decided_by_name:
                            req.session.user.displayName ||
                            req.session.user.username,
                        decided_by_rank:
                            req.session.user.rank || "",
                        decision_note: reason,
                        decided_at: now,
                        updated_at: now
                    })
                    .eq("id", requestId);

            if (error) throw error;

            let dmSent = true;

            try {
                await sendDiscordDM(
                    String(requestRow.author_id),
                    `📟 CERERE CALLSIGN RESPINSĂ\n\nCererea ta de callsign a fost respinsă.${reason ? `\nMotiv: **${reason}**` : ""}\n\nDecizie luată de: **${req.session.user.displayName || req.session.user.username}**`
                );
            }
            catch (dmError) {
                dmSent = false;
                console.error(
                    "Callsign Reject DM Error:",
                    dmError.response?.data || dmError.message
                );
            }

            return res.json({
                success: true,
                dmSent
            });
        }
        catch (error) {
            console.error("Callsign Request Reject Error:", error);
            return res.status(500).json({
                error: "Cererea nu a putut fi respinsă."
            });
        }
    }
);


// ======================================================
// ACTIVITĂȚI — RECLAMAȚII
// ======================================================

app.post(
    "/api/complaints",

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

            const targetId =
                String(
                    req.body?.targetId ||
                    ""
                ).trim();

            const targetName =
                String(
                    req.body?.targetName ||
                    ""
                )
                    .trim()
                    .slice(
                        0,
                        120
                    );

            const reason =
                String(
                    req.body?.reason ||
                    ""
                )
                    .trim()
                    .slice(
                        0,
                        1500
                    );

            const evidence =
                String(
                    req.body?.evidence ||
                    ""
                )
                    .trim()
                    .slice(
                        0,
                        500
                    );

            if (
                !targetId ||
                !reason
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Selectează colegul și completează motivul."
                    });
            }

            if (
                String(
                    req.session.user.id
                ) ===
                targetId
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Nu poți trimite o reclamație împotriva ta."
                    });
            }

            const row = {
                id:
                    crypto.randomUUID(),

                author_id:
                    String(
                        req.session.user.id
                    ),

                author_name:
                    req.session.user.displayName ||
                    req.session.user.username,

                author_rank:
                    req.session.user.rank ||
                    "",

                target_id:
                    targetId,

                target_name:
                    targetName,

                reason,

                evidence,

                status:
                    "PENDING"
            };

            const {
                error
            } =
                await supabase
                    .from(
                        "complaints"
                    )
                    .insert(
                        row
                    );

            if (error) {
                throw error;
            }

            res
                .status(201)
                .json({
                    success:
                        true
                });

        }

        catch (error) {

            console.error(
                "Complaint Create Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Reclamația nu a putut fi trimisă."
                });
        }
    }
);


// ======================================================
// ACTIVITĂȚI — TESTARE CANDIDAȚI
// ======================================================

app.post(
    "/api/candidate-tests",

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

            const candidateName =
                String(
                    req.body?.candidateName ||
                    ""
                )
                    .trim()
                    .slice(
                        0,
                        100
                    );

            const candidateDiscord =
                String(
                    req.body?.candidateDiscord ||
                    ""
                )
                    .trim()
                    .slice(
                        0,
                        100
                    );

            const result =
                String(
                    req.body?.result ||
                    ""
                )
                    .trim()
                    .toUpperCase();

            const notes =
                String(
                    req.body?.notes ||
                    ""
                )
                    .trim()
                    .slice(
                        0,
                        1500
                    );

            const rawScore =
                req.body?.score;

            const score =
                rawScore ===
                "" ||
                rawScore ===
                null ||
                rawScore ===
                undefined

                    ? null

                    : Math.max(
                        0,
                        Math.min(
                            100,
                            Number(
                                rawScore
                            ) ||
                            0
                        )
                    );

            if (!candidateName) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Numele candidatului este obligatoriu."
                    });
            }

            if (
                ![
                    "PASSED",
                    "FAILED"
                ].includes(
                    result
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Rezultatul testului este invalid."
                    });
            }

            const row = {
                id:
                    crypto.randomUUID(),

                tester_id:
                    String(
                        req.session.user.id
                    ),

                tester_name:
                    req.session.user.displayName ||
                    req.session.user.username,

                tester_rank:
                    req.session.user.rank ||
                    "",

                candidate_name:
                    candidateName,

                candidate_discord:
                    candidateDiscord,

                result,

                score,

                notes
            };

            const {
                error
            } =
                await supabase
                    .from(
                        "candidate_tests"
                    )
                    .insert(
                        row
                    );

            if (error) {
                throw error;
            }

            res
                .status(201)
                .json({
                    success:
                        true
                });

        }

        catch (error) {

            console.error(
                "Candidate Test Create Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Testul candidatului nu a putut fi salvat."
                });
        }
    }
);


// ======================================================
// ACTIVITĂȚI — SANCȚIUNI COORDONATOR+
// ======================================================

app.post(
    "/api/admin/sanctions",

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

            const targetId =
                String(
                    req.body?.targetId ||
                    ""
                ).trim();

            const targetName =
                String(
                    req.body?.targetName ||
                    ""
                )
                    .trim()
                    .slice(
                        0,
                        120
                    );

            const type =
                String(
                    req.body?.type ||
                    ""
                )
                    .trim()
                    .toUpperCase();

            const reason =
                String(
                    req.body?.reason ||
                    ""
                )
                    .trim()
                    .slice(
                        0,
                        1500
                    );

            if (
                !targetId ||
                !reason
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Selectează membrul și completează motivul."
                    });
            }

            if (
                ![
                    "FW",
                    "OUT"
                ].includes(
                    type
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Tipul sancțiunii este invalid."
                    });
            }

            let fwCount =
                type ===
                    "FW"

                    ? Math.max(
                        1,
                        Math.min(
                            5,
                            Number(
                                req.body?.fwCount ||
                                1
                            ) ||
                            1
                        )
                    )

                    : 0;

            let activeFw =
                0;

            if (
                type ===
                "FW"
            ) {

                const {
                    data:
                        existing,

                    error:
                        existingError
                } =
                    await supabase
                        .from(
                            "sanctions"
                        )
                        .select(
                            "fw_count"
                        )
                        .eq(
                            "target_id",
                            targetId
                        )
                        .eq(
                            "type",
                            "FW"
                        )
                        .eq(
                            "active",
                            true
                        );

                if (existingError) {
                    throw existingError;
                }

                const currentFw =
                    (
                        existing ||
                        []
                    ).reduce(
                        (
                            total,
                            row
                        ) =>
                            total +
                            Number(
                                row.fw_count ||
                                0
                            ),

                        0
                    );

                if (
                    currentFw +
                    fwCount >
                    5
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                `Membrul are deja ${currentFw}/5 FW active. Nu poți depăși limita de 5.`
                        });
                }

                activeFw =
                    currentFw +
                    fwCount;
            }

            if (
                type ===
                "OUT"
            ) {

                // Un OUT închide FW-urile active ale membrului.
                const {
                    error:
                        deactivateError
                } =
                    await supabase
                        .from(
                            "sanctions"
                        )
                        .update({
                            active:
                                false
                        })
                        .eq(
                            "target_id",
                            targetId
                        )
                        .eq(
                            "type",
                            "FW"
                        )
                        .eq(
                            "active",
                            true
                        );

                if (deactivateError) {
                    throw deactivateError;
                }
            }

            const row = {
                id:
                    crypto.randomUUID(),

                target_id:
                    targetId,

                target_name:
                    targetName,

                type,

                fw_count:
                    fwCount,

                reason,

                active:
                    true,

                applied_by_id:
                    String(
                        req.session.user.id
                    ),

                applied_by_name:
                    req.session.user.displayName ||
                    req.session.user.username,

                applied_by_rank:
                    req.session.user.rank ||
                    ""
            };

            const {
                error
            } =
                await supabase
                    .from(
                        "sanctions"
                    )
                    .insert(
                        row
                    );

            if (error) {
                throw error;
            }

            const appliedByName = req.session.user.displayName || req.session.user.username || "Conducerea DIICOT";
            const appliedByRank = req.session.user.rank || "CONDUCERE DIICOT";

            // Sincronizează automat rolul de Faction Warn pe Discord.
            // OUT folosește rolul 5/5 (OUT).
            let roleSynced = false;
            let roleSyncError = null;
            try {
                const roleLevel = type === "OUT" ? 5 : activeFw;
                await syncFactionWarnDiscordRole(targetId, roleLevel);
                roleSynced = true;
            }
            catch (discordRoleError) {
                roleSyncError = discordRoleError?.response?.data?.message || discordRoleError?.message || "Rolul FW nu a putut fi sincronizat.";
                console.warn("Sanction Discord Role Warning:", targetId, roleSyncError);
            }

            // Postează automat sancțiunea în canalul info-sanctiuni.
            let channelSent = false;
            let channelError = null;
            try {
                await sendSanctionInfoMessage({
                    targetId,
                    targetName,
                    type,
                    fwCount,
                    activeFw,
                    reason,
                    appliedByName,
                    appliedByRank
                });
                channelSent = true;
            }
            catch (channelPostError) {
                channelError = channelPostError?.response?.data?.message || channelPostError?.message || "Mesajul din info-sanctiuni nu a putut fi trimis.";
                console.warn("Sanction Info Channel Warning:", channelError);
            }

            let dmSent = false;
            let dmError = null;
            try {
                const dmLines = type === "OUT"
                    ? ["📋 **NOTIFICARE SANCȚIUNE — DIICOT**", "", "Ai primit sancțiunea **OUT**.", `**Motiv:** ${reason}`, `**Aplicată de:** ${appliedByName} — ${appliedByRank}`, "", "Această sancțiune a fost înregistrată în sistemul DIICOT."]
                    : ["⚠️ **NOTIFICARE SANCȚIUNE — DIICOT**", "", `Ai primit **${fwCount} Faction Warn**.`, `**Situație activă:** ${activeFw}/5 FW`, `**Motiv:** ${reason}`, `**Aplicată de:** ${appliedByName} — ${appliedByRank}`, "", "Această sancțiune a fost înregistrată în sistemul DIICOT."];
                await sendDiscordDM(targetId, dmLines.join("\n"));
                dmSent = true;
            }
            catch (discordError) {
                dmError = discordError?.response?.data?.message || discordError?.message || "Mesajul privat nu a putut fi livrat.";
                console.warn("Sanction Discord DM Warning:", targetId, dmError);
            }

            res
                .status(201)
                .json({
                    success:
                        true,

                    activeFw,
                    dmSent,
                    dmError,
                    roleSynced,
                    roleSyncError,
                    channelSent,
                    channelError
                });

        }

        catch (error) {

            console.error(
                "Sanction Create Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Sancțiunea nu a putut fi aplicată."
                });
        }
    }
);



// ======================================================
// TEST MANAGEMENT — LOAD
// ======================================================

app.get(
    "/api/test-management",
    requireAuth,
    async (req, res) => {

        if (!ensureSupabase(res)) {
            return;
        }

        try {

            const [
                categoriesResult,
                questionsResult,
                settingsResult,
                historyResult
            ] = await Promise.all([
                supabase
                    .from("test_categories")
                    .select("*")
                    .order("position", { ascending: true })
                    .order("name", { ascending: true }),

                supabase
                    .from("test_questions")
                    .select("*")
                    .order("position", { ascending: true }),

                supabase
                    .from("test_settings")
                    .select("*")
                    .eq("department", "DIICOT")
                    .maybeSingle(),

                supabase
                    .from("test_history")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(500)
            ]);

            if (categoriesResult.error) throw categoriesResult.error;
            if (questionsResult.error) throw questionsResult.error;
            if (settingsResult.error) throw settingsResult.error;
            if (historyResult.error) throw historyResult.error;

            const settingsRow =
                settingsResult.data || {};

            return res.json({
                permissions: {
                    leadership:
                        Number(req.session.user?.rankLevel || 0) >= 10,
                    tester:
                        hasTesterAccess(req.session.user)
                },

                categories:
                    (categoriesResult.data || []).map(mapTestCategory),

                questions:
                    (questionsResult.data || []).map(mapTestQuestion),

                settings: {
                    rejectionThreshold:
                        Number(settingsRow.rejection_threshold || 3),

                    admittedRoleIds:
                        settingsRow.admitted_role_ids || "",

                    dmPassed:
                        settingsRow.dm_passed || "",

                    dmFailed:
                        settingsRow.dm_failed || "",

                    extraction:
                        settingsRow.extraction &&
                        typeof settingsRow.extraction === "object"
                            ? settingsRow.extraction
                            : {}
                },

                history:
                    (historyResult.data || []).map(mapTestHistory)
            });

        }
        catch (error) {

            console.error(
                "Test Management Load Error:",
                error
            );

            return res.status(500).json({
                error:
                    "Gestionarea testelor nu a putut fi încărcată."
            });
        }
    }
);


// ======================================================
// TEST CATEGORIES — COORDONATOR+
// ======================================================

app.post(
    "/api/admin/test-categories",
    requireAdmin,
    async (req, res) => {

        if (!ensureSupabase(res)) return;

        const name =
            String(req.body?.name || "")
                .trim()
                .slice(0, 100);

        if (!name) {
            return res.status(400).json({
                error:
                    "Numele categoriei este obligatoriu."
            });
        }

        try {

            const {
                data,
                error
            } = await supabase
                .from("test_categories")
                .insert({
                    id:
                        crypto.randomUUID(),
                    name
                })
                .select("*")
                .single();

            if (error) throw error;

            return res.status(201).json({
                success: true,
                category:
                    mapTestCategory(data)
            });
        }
        catch (error) {

            return res.status(500).json({
                error:
                    "Categoria nu a putut fi creată."
            });
        }
    }
);


// ======================================================

app.patch(
    "/api/admin/test-categories/order",
    requireAdmin,
    async (req, res) => {

        if (!ensureSupabase(res)) return;

        const ids =
            Array.isArray(req.body?.ids)
                ? req.body.ids
                    .map(id => String(id || "").trim())
                    .filter(Boolean)
                : [];

        if (!ids.length) {
            return res.status(400).json({
                error:
                    "Ordinea categoriilor este goală."
            });
        }

        try {

            for (let index = 0; index < ids.length; index++) {

                const {
                    error
                } = await supabase
                    .from("test_categories")
                    .update({
                        position:
                            index + 1,
                        updated_at:
                            new Date().toISOString()
                    })
                    .eq(
                        "id",
                        ids[index]
                    );

                if (error) {
                    throw error;
                }
            }

            return res.json({
                success: true
            });
        }
        catch (error) {

            console.error(
                "Test Category Order Error:",
                error
            );

            return res.status(500).json({
                error:
                    "Ordinea categoriilor nu a putut fi salvată."
            });
        }
    }
);


app.patch(
    "/api/admin/test-categories/:id",
    requireAdmin,
    async (req, res) => {

        if (!ensureSupabase(res)) return;

        const name =
            String(req.body?.name || "")
                .trim()
                .slice(0, 100);

        if (!name) {
            return res.status(400).json({
                error:
                    "Numele categoriei este obligatoriu."
            });
        }

        try {

            const {
                error
            } = await supabase
                .from("test_categories")
                .update({
                    name,
                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    String(req.params.id)
                );

            if (error) throw error;

            return res.json({
                success: true
            });
        }
        catch (error) {

            return res.status(500).json({
                error:
                    "Categoria nu a putut fi actualizată."
            });
        }
    }
);


app.delete(
    "/api/admin/test-categories/:id",
    requireAdmin,
    async (req, res) => {

        if (!ensureSupabase(res)) return;

        try {

            const {
                error
            } = await supabase
                .from("test_categories")
                .delete()
                .eq(
                    "id",
                    String(req.params.id)
                );

            if (error) throw error;

            return res.json({
                success: true
            });
        }
        catch (error) {

            return res.status(500).json({
                error:
                    "Categoria nu a putut fi ștearsă."
            });
        }
    }
);


// ======================================================
// TEST CATEGORIES — ORDER COORDONATOR+



// ======================================================
// TEST QUESTIONS — COORDONATOR+
// ======================================================

app.post(
    "/api/admin/test-questions",
    requireAdmin,
    async (req, res) => {

        if (!ensureSupabase(res)) return;

        const categoryId =
            String(req.body?.categoryId || "").trim();

        const question =
            String(req.body?.question || "")
                .trim()
                .slice(0, 1000);

        const answer =
            String(req.body?.answer || "")
                .trim()
                .slice(0, 2000);

        if (!categoryId || !question || !answer) {
            return res.status(400).json({
                error:
                    "Categoria, întrebarea și răspunsul sunt obligatorii."
            });
        }

        try {

            const {
                data,
                error
            } = await supabase
                .from("test_questions")
                .insert({
                    id:
                        crypto.randomUUID(),
                    category_id:
                        categoryId,
                    question,
                    answer
                })
                .select("*")
                .single();

            if (error) throw error;

            return res.status(201).json({
                success: true,
                question:
                    mapTestQuestion(data)
            });
        }
        catch (error) {

            return res.status(500).json({
                error:
                    "Întrebarea nu a putut fi creată."
            });
        }
    }
);


// ======================================================

app.patch(
    "/api/admin/test-questions/order",
    requireAdmin,
    async (req, res) => {

        if (!ensureSupabase(res)) return;

        const groups =
            Array.isArray(req.body?.groups)
                ? req.body.groups
                : [];

        if (!groups.length) {
            return res.status(400).json({
                error:
                    "Ordinea întrebărilor este goală."
            });
        }

        try {

            for (const group of groups) {

                const categoryId =
                    String(
                        group?.categoryId ||
                        ""
                    ).trim();

                const questionIds =
                    Array.isArray(group?.questionIds)
                        ? group.questionIds
                            .map(id => String(id || "").trim())
                            .filter(Boolean)
                        : [];

                if (!categoryId) {
                    continue;
                }

                for (
                    let index = 0;
                    index < questionIds.length;
                    index++
                ) {

                    const {
                        error
                    } = await supabase
                        .from("test_questions")
                        .update({
                            category_id:
                                categoryId,
                            position:
                                index + 1,
                            updated_at:
                                new Date().toISOString()
                        })
                        .eq(
                            "id",
                            questionIds[index]
                        );

                    if (error) {
                        throw error;
                    }
                }
            }

            return res.json({
                success: true
            });
        }
        catch (error) {

            console.error(
                "Test Question Order Error:",
                error
            );

            return res.status(500).json({
                error:
                    "Ordinea întrebărilor nu a putut fi salvată."
            });
        }
    }
);


app.patch(
    "/api/admin/test-questions/:id",
    requireAdmin,
    async (req, res) => {

        if (!ensureSupabase(res)) return;

        const categoryId =
            String(req.body?.categoryId || "").trim();

        const question =
            String(req.body?.question || "")
                .trim()
                .slice(0, 1000);

        const answer =
            String(req.body?.answer || "")
                .trim()
                .slice(0, 2000);

        if (!categoryId || !question || !answer) {
            return res.status(400).json({
                error:
                    "Categoria, întrebarea și răspunsul sunt obligatorii."
            });
        }

        try {

            const {
                error
            } = await supabase
                .from("test_questions")
                .update({
                    category_id:
                        categoryId,
                    question,
                    answer,
                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    String(req.params.id)
                );

            if (error) throw error;

            return res.json({
                success: true
            });
        }
        catch (error) {

            return res.status(500).json({
                error:
                    "Întrebarea nu a putut fi actualizată."
            });
        }
    }
);


app.delete(
    "/api/admin/test-questions/:id",
    requireAdmin,
    async (req, res) => {

        if (!ensureSupabase(res)) return;

        try {

            const {
                error
            } = await supabase
                .from("test_questions")
                .delete()
                .eq(
                    "id",
                    String(req.params.id)
                );

            if (error) throw error;

            return res.json({
                success: true
            });
        }
        catch (error) {

            return res.status(500).json({
                error:
                    "Întrebarea nu a putut fi ștearsă."
            });
        }
    }
);


// ======================================================
// TEST QUESTIONS — ORDER / MOVE COORDONATOR+
// Permite reordonarea și mutarea între categorii.



// ======================================================
// TEST SETTINGS — COORDONATOR+
// ======================================================

app.patch(
    "/api/admin/test-settings",
    requireAdmin,
    async (req, res) => {

        if (!ensureSupabase(res)) return;

        const rejectionThreshold =
            Math.max(
                1,
                Math.min(
                    100,
                    Number(req.body?.rejectionThreshold || 3) || 3
                )
            );

        const admittedRoleIds =
            String(req.body?.admittedRoleIds || "")
                .trim()
                .slice(0, 1000);

        const dmPassed =
            String(req.body?.dmPassed || "")
                .slice(0, 4000);

        const dmFailed =
            String(req.body?.dmFailed || "")
                .slice(0, 4000);

        const extraction =
            req.body?.extraction &&
            typeof req.body.extraction === "object"
                ? req.body.extraction
                : {};

        try {

            const {
                error
            } = await supabase
                .from("test_settings")
                .upsert({
                    department:
                        "DIICOT",
                    rejection_threshold:
                        rejectionThreshold,
                    admitted_role_ids:
                        admittedRoleIds,
                    dm_passed:
                        dmPassed,
                    dm_failed:
                        dmFailed,
                    extraction,
                    updated_at:
                        new Date().toISOString(),
                    updated_by_id:
                        String(req.session.user.id),
                    updated_by_name:
                        req.session.user.displayName ||
                        req.session.user.username
                }, {
                    onConflict:
                        "department"
                });

            if (error) throw error;

            return res.json({
                success: true
            });
        }
        catch (error) {

            return res.status(500).json({
                error:
                    "Setările nu au putut fi salvate."
            });
        }
    }
);


// ======================================================
// COMPLETE TEST
// ======================================================

app.post(
    "/api/candidate-tests/complete",
    requireTester,
    async (req, res) => {

        if (!ensureSupabase(res)) {
            return;
        }

        const candidateName =
            String(
                req.body?.candidateName ||
                ""
            )
                .trim()
                .slice(0, 120);

        const candidateDiscord =
            String(
                req.body?.candidateDiscord ||
                ""
            )
                .trim();

        const mistakes =
            Math.max(
                0,
                Number(
                    req.body?.mistakes ||
                    0
                ) ||
                0
            );

        const questions =
            Array.isArray(
                req.body?.questions
            )
                ? req.body.questions
                : [];

        if (
            !candidateName ||
            !/^\d{17,20}$/.test(
                candidateDiscord
            )
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Numele candidatului sau Discord ID-ul este invalid."
                });
        }

        try {

            /*
             * Pragul și rolurile sunt citite DIRECT din Supabase.
             * Nu avem încredere în verdictul/pragul trimis de browser.
             */
            const {
                data:
                    settingsRow,

                error:
                    settingsError
            } =
                await supabase
                    .from(
                        "test_settings"
                    )
                    .select(
                        "*"
                    )
                    .eq(
                        "department",
                        "DIICOT"
                    )
                    .maybeSingle();

            if (settingsError) {
                throw settingsError;
            }

            const threshold =
                Math.max(
                    1,
                    Number(
                        settingsRow?.rejection_threshold ||
                        3
                    ) ||
                    3
                );

            const verdict =
                mistakes <
                    threshold
                    ? "PASSED"
                    : "FAILED";

            let assignedRoleIds =
                [];

            /*
             * Dacă este ADMIS:
             * - citim rolurile configurate în SETĂRI
             * - verificăm candidatul în guild
             * - adăugăm fiecare rol cu endpoint-ul Discord dedicat
             */
            if (
                verdict ===
                "PASSED"
            ) {

                if (!BOT_TOKEN) {

                    return res
                        .status(500)
                        .json({
                            error:
                                "Botul Discord nu este configurat. Testul nu a fost finalizat."
                        });
                }

                const admittedRoleIds =
                    String(
                        settingsRow?.admitted_role_ids ||
                        ""
                    )
                        .split(
                            /[\s,;]+/
                        )
                        .map(
                            roleId =>
                                roleId.trim()
                        )
                        .filter(
                            roleId =>
                                /^\d{17,20}$/.test(
                                    roleId
                                )
                        );

                if (
                    !admittedRoleIds.length
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                "Candidatul este ADMIS, dar nu ai configurat niciun ID de rol în SETĂRI → ID-URI ROLURI DISCORD (ADMIS)."
                        });
                }

                /*
                 * Verificăm că membrul există pe server.
                 */
                try {

                    await axios.get(
                        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${candidateDiscord}`,
                        {
                            headers: {
                                Authorization:
                                    `Bot ${BOT_TOKEN}`
                            }
                        }
                    );

                }
                catch (discordMemberError) {

                    if (
                        discordMemberError.response?.status ===
                        404
                    ) {

                        return res
                            .status(404)
                            .json({
                                error:
                                    "Candidatul nu a fost găsit pe serverul Discord."
                            });
                    }

                    throw discordMemberError;
                }

                for (
                    const roleId
                    of admittedRoleIds
                ) {

                    try {

                        await axios.put(
                            `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${candidateDiscord}/roles/${roleId}`,
                            null,
                            {
                                headers: {
                                    Authorization:
                                        `Bot ${BOT_TOKEN}`
                                }
                            }
                        );

                        assignedRoleIds.push(
                            roleId
                        );

                    }
                    catch (roleError) {

                        console.error(
                            "Discord Assign Test Role Error:",
                            roleError.response?.data ||
                            roleError.message
                        );

                        if (
                            roleError.response?.status ===
                            403
                        ) {

                            return res
                                .status(403)
                                .json({
                                    error:
                                        "Discord a refuzat acordarea rolului. Pune rolul botului deasupra rolurilor acordate candidatului."
                                });
                        }

                        if (
                            roleError.response?.status ===
                            404
                        ) {

                            return res
                                .status(404)
                                .json({
                                    error:
                                        `Rolul Discord ${roleId} sau candidatul nu a fost găsit.`
                                });
                        }

                        return res
                            .status(500)
                            .json({
                                error:
                                    `Rolul Discord ${roleId} nu a putut fi acordat.`
                            });
                    }
                }
            }

            const {
                error:
                    historyError
            } =
                await supabase
                    .from(
                        "test_history"
                    )
                    .insert({
                        id:
                            crypto.randomUUID(),

                        department:
                            "DIICOT",

                        candidate_name:
                            candidateName,

                        candidate_discord:
                            candidateDiscord,

                        tester_id:
                            String(
                                req.session.user.id
                            ),

                        tester_name:
                            req.session.user.displayName ||
                            req.session.user.username,

                        tester_rank:
                            req.session.user.rank ||
                            "",

                        mistakes,

                        threshold,

                        verdict,

                        question_results:
                            questions
                    });

            if (historyError) {
                throw historyError;
            }

            return res
                .status(201)
                .json({
                    success:
                        true,

                    verdict,

                    threshold,

                    mistakes,

                    assignedRoleIds
                });

        }
        catch (error) {

            console.error(
                "Complete Test Error:",
                error.response?.data ||
                error
            );

            return res
                .status(500)
                .json({
                    error:
                        "Testul nu a putut fi finalizat."
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


        res.redirect(
            "/"
        );
    }
);


// ======================================================
// API LOGOUT
// ======================================================

app.post(
    "/api/logout",

    (
        req,
        res
    ) => {

        req.session =
            null;


        res.json({

            success:
                true,

            message:
                "Te-ai deconectat."
        });
    }
);


// ======================================================
// HEALTH CHECK
// ======================================================

app.get(
    "/health",

    (
        req,
        res
    ) => {

        res.json({

            status:
                "ok",

            service:
                "DIICOT Command Center",

            timestamp:
                new Date()
                    .toISOString()
        });
    }
);


// ======================================================
// 404 API
// ======================================================

app.use(
    "/api",

    (
        req,
        res
    ) => {

        res
            .status(404)
            .json({
                error:
                    "Ruta API nu există."
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

        console.error(
            "Server Error:",
            error
        );


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
                            "O imagine depășește limita de 8 MB."
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


            return res
                .status(400)
                .json({
                    error:
                        error.message
                });
        }


        if (
            error?.message ===
            "Sunt acceptate doar imagini JPG, PNG și WEBP."
        ) {

            return res
                .status(400)
                .json({
                    error:
                        error.message
                });
        }


        if (
            res.headersSent
        ) {

            return next(
                error
            );
        }


        res
            .status(500)
            .json({
                error:
                    "A apărut o eroare internă pe server."
            });
    }
);


// ======================================================
// START SERVER
// ======================================================

app.listen(
    PORT,

    () => {

        console.log(
            `DIICOT Command Center rulează pe portul ${PORT}`
        );

        console.log(
            `Discord Guild: ${GUILD_ID || "NECONFIGURAT"}`
        );

        console.log(
            `Supabase: ${SUPABASE_URL ? "CONFIGURAT" : "NECONFIGURAT"}`
        );
    }
);
