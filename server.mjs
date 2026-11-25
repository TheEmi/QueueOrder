import { createApp } from "./app.mjs";
import { services } from "./services.js";

const production = process.env.NODE_ENV === "production"
    || process.env.PROD === "1"
    || process.env.PROD === "true";
const requested = Number(process.env.PORT);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 3000;
const host = "0.0.0.0";
const app = await createApp({
    services,
    dev: !production,
    build: process.env.BUILD || (production ? "production" : "dev"),
    trustProxy: production,
});
const bound = await app.listen({ port, host });
console.log(`Queue Order is listening on ${host}:${bound.port}`);

async function stop() {
    await app.close();
    process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
