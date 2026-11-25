import os from "node:os";
import { createApp } from "./app.mjs";
import { services } from "./services.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const app = await createApp({
    services,
    dev: !process.env.PROD,
    build: process.env.BUILD || "dev",
});
const bound = await app.listen({ port, host });

const local = `http://127.0.0.1:${bound.port}`;
const network = [];
for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
        if (entry.family === "IPv4" && !entry.internal) {
            network.push(`http://${entry.address}:${bound.port}`);
        }
    }
}
console.log(`Queue Order is listening on ${local}`);
if (network.length) {
    console.log("Open one of these on this computer so other phones can scan:");
    for (const url of network) console.log(`  ${url}`);
}

async function stop() {
    await app.close();
    process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
