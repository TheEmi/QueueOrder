import { randomInt, timingSafeEqual } from "node:crypto";
import { fail } from "juris/errors.js";
import { ALPHABET, canonCode, canonPair, isCode, isPair } from "./client/codes.js";

const MAX_SESSIONS = 2000;
const MAX_TICKET = 999;

function mint(length) {
    let text = "";
    for (let index = 0; index < length; index += 1) {
        text += ALPHABET[randomInt(ALPHABET.length)];
    }
    return text;
}

function nameOf(value) {
    const text = String(value ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
    return text || "Queue";
}

function deviceOf(value) {
    if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
        fail("This phone could not be recognised. Reload and try again.");
    }
    return value.toLowerCase();
}

function numberOf(value) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_TICKET) {
        fail("That is not a number in this queue.");
    }
    return value;
}

function samePair(left, right) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}

function snapshot(session) {
    const waiting = [];
    const removed = [];
    for (const [n, status] of session.status) {
        if (status === "waiting") waiting.push(n);
        else if (status === "removed") removed.push(n);
    }
    waiting.sort((a, b) => a - b);
    removed.sort((a, b) => a - b);
    return {
        exists: true,
        code: session.code,
        name: session.name,
        closed: session.closed,
        serving: session.serving,
        waiting,
        removed,
        issued: session.issued,
    };
}

// One process, one map. Nothing is written to disk: restarting the server
// drops every queue. Phones keep the codes, and learn the queue is gone.
export function createStore() {
    const sessions = new Map();

    function sessionOf(codeValue) {
        const code = canonCode(codeValue);
        if (!isCode(code)) fail("Enter the queue's four-character code.");
        const session = sessions.get(code);
        if (!session) fail("There is no queue with that code.", { status: 404 });
        return session;
    }

    function hostSession(codeValue, pairValue) {
        const session = sessionOf(codeValue);
        const pair = canonPair(pairValue);
        if (!isPair(pair) || !samePair(session.pair, pair)) {
            fail("That pairing code is wrong.", { status: 403 });
        }
        return session;
    }

    return {
        create(name) {
            if (sessions.size >= MAX_SESSIONS) {
                fail("This server is hosting as many queues as it can. Delete one first.");
            }
            let code = "";
            for (let attempt = 0; attempt < 8 && !code; attempt += 1) {
                const candidate = mint(4);
                if (!sessions.has(candidate)) code = candidate;
            }
            if (!code) fail("Could not open a queue. Try again.");
            const session = {
                code,
                pair: mint(6),
                name: nameOf(name),
                closed: false,
                serving: null,
                issued: 0,
                status: new Map(),
                devices: new Map(),
            };
            sessions.set(code, session);
            return { code: session.code, pair: session.pair, name: session.name };
        },

        board(codeValue) {
            const code = canonCode(codeValue);
            if (!isCode(code)) return { exists: false, code };
            const session = sessions.get(code);
            return session ? snapshot(session) : { exists: false, code };
        },

        take(codeValue, deviceValue) {
            const session = sessionOf(codeValue);
            if (session.closed) fail("This queue is closed.");
            const device = deviceOf(deviceValue);
            const held = session.devices.get(device);
            if (held) {
                const status = session.status.get(held);
                if (status === "waiting" || status === "serving") {
                    return { n: held, name: session.name };
                }
            }
            if (session.issued >= MAX_TICKET) fail("This queue is full.");
            const n = session.issued + 1;
            session.issued = n;
            session.status.set(n, "waiting");
            session.devices.set(device, n);
            return { n, name: session.name };
        },

        next(codeValue, pairValue) {
            const session = hostSession(codeValue, pairValue);
            if (session.serving != null) session.status.set(session.serving, "done");
            let chosen = null;
            for (const [n, status] of session.status) {
                if (status === "waiting" && (chosen == null || n < chosen)) chosen = n;
            }
            session.serving = chosen;
            if (chosen != null) session.status.set(chosen, "serving");
            return snapshot(session);
        },

        remove(codeValue, pairValue, nValue) {
            const session = hostSession(codeValue, pairValue);
            const n = numberOf(nValue);
            const status = session.status.get(n);
            if (status == null) fail("That number is not in this queue.");
            if (status === "done") fail("That number was already called.");
            if (status === "removed") fail("That number is already gone.");
            session.status.set(n, "removed");
            if (session.serving === n) session.serving = null;
            return snapshot(session);
        },

        close(codeValue, pairValue) {
            const session = hostSession(codeValue, pairValue);
            session.closed = true;
            return snapshot(session);
        },

        reopen(codeValue, pairValue) {
            const session = hostSession(codeValue, pairValue);
            session.closed = false;
            return snapshot(session);
        },

        delete(codeValue, pairValue) {
            const session = hostSession(codeValue, pairValue);
            sessions.delete(session.code);
            return { deleted: true, code: session.code };
        },

        unlock(codeValue, pairValue) {
            const session = hostSession(codeValue, pairValue);
            return { code: session.code, name: session.name };
        },
    };
}
