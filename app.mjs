import { createJurisServer } from "juris-kit/server/kernel.js";
import { canonCode } from "./client/codes.js";
import { routes, register, title } from "./client/app.js";

function boardTarget(code) {
    const canon = canonCode(code);
    return canon ? [{ name: "board", args: [canon] }] : [];
}

export function createApp({ services, dev = false, build = "dev" }) {
    return createJurisServer({
        root: new URL(".", import.meta.url),
        dev,
        build,
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
            state: () => ({ origin: "" }),
            head: async ({ versioned }) => ({
                styles: [{ href: await versioned("/client/site.css") }],
                meta: [
                    { name: "theme-color", content: "#f4efe6" },
                    { name: "robots", content: "noindex" },
                ],
            }),
            headers: () => ({
                "x-content-type-options": "nosniff",
                "referrer-policy": "no-referrer",
            }),
        },
    });
}
