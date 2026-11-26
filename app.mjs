import { randomUUID } from "node:crypto";
import { createJurisServer } from "juris-kit/server/kernel.js";
import { canonCode } from "./client/codes.js";
import { DEVICE_COOKIE, readCookieDevice } from "./client/device.js";
import { routes, register, title } from "./client/app.js";

function visitor(req, url) {
    if (!url.pathname.startsWith("/s/")) return null;
    const existing = readCookieDevice(req.headers.cookie);
    if (existing) return { deviceId: existing, fresh: false };
    return { deviceId: randomUUID(), fresh: true };
}

function pageState({ route, viewer }, services) {
    const deviceId = viewer?.deviceId || "";
    const roots = { origin: "", deviceId };
    if (route?.name !== "ticket" || !deviceId) return roots;
    const code = canonCode(route.params?.code);
    const current = services.board(code);
    if (!current?.exists) return roots;
    if (current.closed) return { ...roots, ticketError: { code, message: "This queue is closed." } };
    try {
        const taken = services.takeTicket(code, deviceId);
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
    return createJurisServer({
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
            viewer: visitor,
            state: (ctx) => pageState(ctx, services),
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
}
