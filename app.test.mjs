import assert from "node:assert/strict";
import { test } from "node:test";
import Juris from "juris/juris.js";
import SSRRenderer from "juris-kit/server/ssr-renderer.js";
import { createApp } from "./app.mjs";
import { qrLayout } from "./client/pages.js";
import { createServices } from "./services.js";

const phoneA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const phoneB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function withApp(run) {
    const app = await createApp({ services: createServices() });
    const { url } = await app.listen();
    try {
        await run(url);
    } finally {
        await app.close();
    }
}

async function post(url, name, args) {
    const response = await fetch(`${url}/api/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
    });
    return { status: response.status, body: await response.json() };
}

test("a queue gives numbers, calls the next, and can be closed or deleted", async () => {
    await withApp(async (url) => {
        const created = await post(url, "createSession", ["Front counter"]);
        assert.equal(created.status, 200);
        const { code, pair, name } = created.body;
        assert.equal(name, "Front counter");
        assert.match(code, /^[A-Z2-9]{4}$/);
        assert.match(pair, /^[A-Z2-9]{6}$/);

        const board = await post(url, "board", [code.toLowerCase()]);
        assert.equal(board.body.exists, true);
        assert.equal(board.body.name, "Front counter");
        assert.equal(board.body.serving, null);
        assert.deepEqual(board.body.waiting, []);
        assert.equal(Object.hasOwn(board.body, "pair"), false);

        const first = await post(url, "takeTicket", [code, phoneA]);
        const again = await post(url, "takeTicket", [code, phoneA]);
        const second = await post(url, "takeTicket", [code, phoneB]);
        assert.equal(first.body.n, 1);
        assert.equal(again.body.n, 1);
        assert.equal(second.body.n, 2);

        const called = await post(url, "callNext", [code, pair]);
        assert.equal(called.body.serving, 1);
        assert.deepEqual(called.body.waiting, [2]);

        const removed = await post(url, "removeTicket", [code, ` ${pair.toLowerCase()} `, 2]);
        assert.equal(removed.status, 200);
        assert.deepEqual(removed.body.waiting, []);
        assert.deepEqual(removed.body.removed, [2]);

        const after = await post(url, "takeTicket", [code, phoneB]);
        assert.equal(after.body.n, 3);

        const finished = await post(url, "callNext", [code, pair]);
        assert.equal(finished.body.serving, 3);
        const done = await post(url, "callNext", [code, pair]);
        assert.equal(done.body.serving, null);
        const renewed = await post(url, "takeTicket", [code, phoneA]);
        assert.equal(renewed.body.n, 4);

        const wrong = await post(url, "callNext", [code, "ZZZZZZ"]);
        assert.equal(wrong.status, 403);
        assert.equal(wrong.body.error, "That pairing code is wrong.");

        const closed = await post(url, "closeSession", [code, pair]);
        assert.equal(closed.body.closed, true);
        const blocked = await post(url, "takeTicket", [code, phoneB]);
        assert.equal(blocked.status, 400);
        assert.equal(blocked.body.error, "This queue is closed.");

        const reopened = await post(url, "reopenSession", [code, pair]);
        assert.equal(reopened.body.closed, false);
        const unlocked = await post(url, "unlock", [code, pair]);
        assert.equal(unlocked.body.name, "Front counter");

        const deleted = await post(url, "deleteSession", [code, pair]);
        assert.equal(deleted.body.deleted, true);
        const gone = await post(url, "board", [code]);
        assert.deepEqual(gone.body, { exists: false, code });
        const late = await post(url, "callNext", [code, pair]);
        assert.equal(late.status, 404);
    });
});

test("pages render the queue and keep the pairing code off the customer page", async () => {
    await withApp(async (url) => {
        const { body } = await post(url, "createSession", ["Bakery"]);
        const customer = await fetch(`${url}/s/${body.code}`);
        const host = await fetch(`${url}/h/${body.code}`);
        const customerHtml = await customer.text();
        const hostHtml = await host.text();

        assert.equal(customer.status, 200);
        assert.match(customerHtml, /<h1[^>]*>Bakery<\/h1>/);
        assert.match(customerHtml, /Take a number/);
        assert.match(customerHtml, /site\.css\?v=/);
        assert.equal(customerHtml.includes(body.pair), false);
        assert.equal(hostHtml.includes(body.pair), false);
        assert.match(hostHtml, /Now serving/);

        const css = await fetch(`${url}/client/site.css`);
        assert.equal(css.status, 200);
        assert.match(css.headers.get("content-type"), /text\/css/);

        const missing = await fetch(`${url}/nowhere`);
        assert.equal(missing.status, 404);
        assert.match(await missing.text(), /Nothing here/);
    });
});

test("a live board hears a new number", async () => {
    await withApp(async (url) => {
        const { body } = await post(url, "createSession", ["Window"]);
        const response = await fetch(`${url}/api/events`);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let text = "";
        const next = async (type) => {
            const event = new RegExp(`event: ${type}\\ndata: (.*)\\n\\n`);
            let found;
            while (!(found = event.exec(text))) {
                const chunk = await reader.read();
                if (chunk.done) return null;
                text += chunk.value;
            }
            text = text.slice(found.index + found[0].length);
            return JSON.parse(found[1]);
        };
        try {
            const hello = await next("hello");
            const subscribed = await fetch(`${url}/api/_live`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    client: hello.client,
                    subscribe: {
                        key: `board:["${body.code}"]`,
                        name: "board",
                        args: [body.code],
                    },
                }),
            });
            assert.equal(subscribed.status, 200, await subscribed.clone().text());
            const first = await next("patch");
            assert.deepEqual(first.full.waiting, []);

            await post(url, "takeTicket", [body.code, phoneA]);
            const changed = await next("patch");
            assert.equal(changed.error, undefined);
            const after = await post(url, "board", [body.code]);
            assert.deepEqual(after.body.waiting, [1]);
        } finally {
            await reader.cancel();
        }
    });
});

test("a customer link renders as an SVG QR", () => {
    const juris = new Juris({ features: { ssr: SSRRenderer } });
    const html = juris.renderToString(qrLayout("http://192.168.1.20:3000/s/AB12", "Customer code"));
    assert.match(html, /^<figure class="qr-frame"><svg class="qr" viewBox="0 0 \d+ \d+"/);
    assert.match(html, /aria-label="Customer code"/);
    assert.match(html, /<rect [^>]*fill="#1d1a16"/);
    assert.equal(html.includes("<script"), false);
});
