import { randomUUID } from "node:crypto";
import { createJurisServer } from "juris-kit/server/kernel.js";
import { canonCode } from "./client/codes.js";
import { DEVICE_COOKIE, readCookieDevice } from "./client/device.js";
import { routes, register, title } from "./client/app.js";

function firstHeader(req, name) {
    return String(req.headers[name] ?? "").split(",")[0].trim();
}

function requestOrigin(req, trustProxy) {
    const forwardedHost = trustProxy ? firstHeader(req, "x-forwarded-host") : "";
    const forwardedProto = trustProxy ? firstHeader(req, "x-forwarded-proto") : "";
    const host = forwardedHost || String(req.headers.host ?? "").trim();
    const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : "http";
    if (!/^[[\]A-Za-z0-9.:-]+$/.test(host)) return "";
    try {
        const parsed = new URL(`${proto}://${host}`);
        if (parsed.username || parsed.password) return "";
        return parsed.origin;
    } catch {
        return "";
    }
}

function visitor(req, url, trustProxy) {
    const origin = requestOrigin(req, trustProxy);
    if (url.pathname.startsWith("/tv/")) return { origin };
    if (!url.pathname.startsWith("/s/")) return null;
    const existing = readCookieDevice(req.headers.cookie);
    if (existing) return { deviceId: existing, fresh: false, origin };
    return { deviceId: randomUUID(), fresh: true, origin };
}

async function pageState({ route, viewer }, services, invalidate) {
    const deviceId = viewer?.deviceId || "";
    const roots = { origin: viewer?.origin || "", deviceId };
    if (route?.name !== "ticket" || !deviceId) return roots;
    const code = canonCode(route.params?.code);
    const current = services.board(code);
    if (!current?.exists) return roots;
    if (current.closed) return { ...roots, ticketError: { code, message: "This queue is closed." } };
    try {
        const taken = services.takeTicket(code, deviceId);
        // The page calls the service itself, so the live line is told here. A call through
        // /api does this on its own. The number stands either way.
        try {
            await invalidate([{ name: "board", args: [code] }]);
        } catch (error) {
            console.error(error);
        }
        return { ...roots, ticket: { code, n: taken.n, name: taken.name } };
    } catch (error) {
        const message = error?.expose ? error.message : "Something went wrong. Try again.";
        return { ...roots, ticketError: { code, message } };
    }
}

function boardTarget(code) {
    const canon = canonCode(code);
    return canon ? [{ name: "board", args: [canon] }] : [];
}

export function createApp({ services, dev = false, build = "dev", trustProxy = false }) {
    let invalidate = () => Promise.resolve();
    const created = createJurisServer({
        root: new URL(".", import.meta.url),
        dev,
        build,
        trustProxy,
        services,
        routes,
        setup: register,
        api: {
            live: {
                public: true,
                strictQueries: true,
                queries: ["board"],
                touches: {
                    createSession(_name, result) {
                        return result?.code ? boardTarget(result.code) : [];
                    },
                    takeTicket(code) {
                        return boardTarget(code);
                    },
                    callNext(code) {
                        return boardTarget(code);
                    },
                    removeTicket(code) {
                        return boardTarget(code);
                    },
                    closeSession(code) {
                        return boardTarget(code);
                    },
                    reopenSession(code) {
                        return boardTarget(code);
                    },
                    deleteSession(code) {
                        return boardTarget(code);
                    },
                    unlock() {
                        return [];
                    },
                },
            },
            strict: { names: Object.keys(services) },
        },
        modules: {
            mounts: [{ url: "/client/", dir: "client", only: [".js", ".css"] }],
            entry: "/client/boot.js",
        },
        page: {
            title,
            viewer: (req, url) => visitor(req, url, trustProxy),
            state: (ctx) => pageState(ctx, services, (targets) => invalidate(targets)),
            head: async ({ versioned }) => ({
                styles: [{ href: await versioned("/client/site.css") }],
                meta: [
                    { name: "theme-color", content: "#ffffff" },
                    { name: "robots", content: "noindex" },
                ],
            }),
            headers: ({ viewer }) => ({
                "x-content-type-options": "nosniff",
                "referrer-policy": "no-referrer",
                ...(viewer?.fresh
                    ? { "set-cookie": `${DEVICE_COOKIE}=${viewer.deviceId}; Path=/; Max-Age=31536000; SameSite=Lax` }
                    : {}),
            }),
        },
    });
    return Promise.resolve(created).then((app) => {
        invalidate = (targets) => app.invalidate(targets);
        return app;
    });
}
