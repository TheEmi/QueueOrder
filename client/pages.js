import { encode } from "./uqr.js";
import { canonCode, canonPair, isCode, isPair, spaced } from "./codes.js";
import {
    deviceId,
    forgetHost,
    forgetTicket,
    hostOf,
    onDeviceChange,
    rememberHost,
    rememberTicket,
    savedHosts,
    savedTickets,
    ticketOf,
} from "./device.js";

function errorMessage(failure) {
    const text = typeof failure?.message === "string" ? failure.message : "";
    if (!text || text === "request failed") return "Something went wrong. Try again.";
    return text;
}

function displayNumber(n) {
    return n == null ? "—" : String(n);
}

function onThisMachine(origin) {
    if (!origin) return false;
    try {
        const host = new URL(origin).hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "::1";
    } catch {
        return false;
    }
}

function wordmark() {
    return { a: { className: "wordmark", href: "/", textContent: "Queue Order" } };
}

export function qrLayout(text, caption) {
    if (!text) {
        return { p: { className: "qr-wait", textContent: "Preparing the code…" } };
    }
    const { data, size } = encode(text, { ecc: "M", border: 4 });
    const cells = [{ rect: { width: size, height: size, fill: "#ffffff" } }];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            if (data[y][x]) {
                cells.push({ rect: { x, y, width: 1, height: 1, fill: "#1d1a16" } });
            }
        }
    }
    return {
        figure: {
            className: "qr-frame",
            children: [
                {
                    svg: {
                        className: "qr",
                        viewBox: `0 0 ${size} ${size}`,
                        role: "img",
                        "aria-label": caption,
                        "shape-rendering": "crispEdges",
                        children: cells,
                    },
                },
                { figcaption: { textContent: caption } },
            ],
        },
    };
}

function textField({ id, label, value, set, maxlength, autocapitalize = "off", placeholder }) {
    return {
        label: {
            className: "field",
            children: [
                { span: { textContent: label } },
                {
                    input: {
                        id,
                        name: id,
                        type: "text",
                        value,
                        oninput: (event) => set(event.target.value),
                        placeholder,
                        maxlength,
                        autocapitalize,
                        autocomplete: "off",
                        spellcheck: "false",
                    },
                },
            ],
        },
    };
}

function backButton(open) {
    return {
        button: {
            className: "text",
            type: "button",
            onclick: () => open("choose"),
            textContent: "Back",
        },
    };
}

export function Home(props, api) {
    const [name, setName] = api.useState("name", "");
    const [joinCode, setJoinCode] = api.useState("joinCode", "");
    const [joinPair, setJoinPair] = api.useState("joinPair", "");
    const [lookCode, setLookCode] = api.useState("lookCode", "");
    const [error, setError] = api.useState("error", "");
    const [pending, setPending] = api.useState("pending", "");
    const [saved, setSaved] = api.useState("saved", null);
    const [panel, setPanel] = api.useState("panel", "choose");

    function open(next) {
        setError("");
        setPanel(next);
    }

    api.onMount(() => {
        const sync = () => setSaved({ hosts: savedHosts(), tickets: savedTickets() });
        sync();
        api.onCleanup(onDeviceChange(sync));
    });

    async function create(event) {
        event.preventDefault();
        if (pending()) return;
        setPending("create");
        setError("");
        try {
            const created = await api.call("createSession", name());
            rememberHost(created.code, created.pair, created.name);
            await api.navigate(`/h/${created.code}`);
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            setPending("");
        }
    }

    async function join(event) {
        event.preventDefault();
        if (pending()) return;
        const code = canonCode(joinCode());
        const pair = canonPair(joinPair());
        if (!isCode(code) || !isPair(pair)) {
            setError("Enter the queue code and the pairing code.");
            return;
        }
        setPending("join");
        setError("");
        try {
            const unlocked = await api.call("unlock", code, pair);
            rememberHost(unlocked.code, pair, unlocked.name);
            await api.navigate(`/h/${unlocked.code}`);
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            setPending("");
        }
    }

    async function look(event) {
        event.preventDefault();
        if (pending()) return;
        const code = canonCode(lookCode());
        if (!isCode(code)) {
            setError("Enter the four-character queue code.");
            return;
        }
        setPending("look");
        setError("");
        try {
            const taken = await api.call("takeTicket", code, deviceId());
            rememberTicket(code, taken.n, taken.name);
            await api.navigate(`/s/${code}`);
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            setPending("");
        }
    }

    function choiceButtons() {
        return {
            div: {
                className: "choices",
                children: [
                    {
                        button: {
                            className: "primary",
                            type: "button",
                            onclick: () => open("create"),
                            textContent: "Create queue",
                        },
                    },
                    {
                        button: {
                            className: "ghost",
                            type: "button",
                            onclick: () => open("join"),
                            textContent: "Join queue",
                        },
                    },
                ],
            },
        };
    }

    function createForm() {
        return {
            form: {
                className: "sheet stack",
                onsubmit: create,
                children: [
                    { h2: { textContent: "Create queue" } },
                    textField({
                        id: "queue-name",
                        label: "Name",
                        value: () => name(),
                        set: setName,
                        maxlength: 40,
                        placeholder: "Front counter",
                    }),
                    {
                        button: {
                            className: "primary",
                            type: "submit",
                            disabled: () => pending() === "create",
                            textContent: () => (pending() === "create" ? "Creating…" : "Create queue"),
                        },
                    },
                    backButton(open),
                ],
            },
        };
    }

    function joinCustomerForm() {
        return {
            form: {
                className: "sheet stack",
                onsubmit: look,
                children: [
                    { h2: { textContent: "Join queue" } },
                    {
                        p: {
                            className: "lede",
                            textContent: "Enter the code. This phone gets a number straight away.",
                        },
                    },
                    textField({
                        id: "look-code",
                        label: "Queue code",
                        value: () => lookCode(),
                        set: setLookCode,
                        maxlength: 11,
                        autocapitalize: "characters",
                        placeholder: "AB12",
                    }),
                    {
                        button: {
                            className: "primary",
                            type: "submit",
                            disabled: () => pending() === "look",
                            textContent: () => (pending() === "look" ? "Getting your number…" : "Join queue"),
                        },
                    },
                    {
                        button: {
                            className: "ghost",
                            type: "button",
                            onclick: () => open("host"),
                            textContent: "I run this queue",
                        },
                    },
                    backButton(open),
                ],
            },
        };
    }

    function joinHostForm() {
        return {
            form: {
                className: "sheet stack",
                onsubmit: join,
                children: [
                    { h2: { textContent: "Run it on this phone" } },
                    {
                        p: {
                            className: "lede",
                            textContent: "Enter the queue code and the pairing code.",
                        },
                    },
                    textField({
                        id: "join-code",
                        label: "Queue code",
                        value: () => joinCode(),
                        set: setJoinCode,
                        maxlength: 11,
                        autocapitalize: "characters",
                        placeholder: "AB12",
                    }),
                    textField({
                        id: "join-pair",
                        label: "Pairing code",
                        value: () => joinPair(),
                        set: setJoinPair,
                        maxlength: 11,
                        autocapitalize: "characters",
                        placeholder: "ABC DEF",
                    }),
                    {
                        button: {
                            className: "primary",
                            type: "submit",
                            disabled: () => pending() === "join",
                            textContent: () => (pending() === "join" ? "Checking…" : "Run it on this phone"),
                        },
                    },
                    {
                        button: {
                            className: "text",
                            type: "button",
                            onclick: () => open("join"),
                            textContent: "Back",
                        },
                    },
                ],
            },
        };
    }

    return {
        section: {
            className: "home",
            children: [
                wordmark(),
                { h1: { textContent: "Give everyone a number" } },
                {
                    p: {
                        className: "lede",
                        textContent: "Create a queue on this phone, or join one and take your place.",
                    },
                },
                {
                    div: {
                        children: () => {
                            if (panel() === "create") return [createForm()];
                            if (panel() === "join") return [joinCustomerForm()];
                            if (panel() === "host") return [joinHostForm()];
                            return [choiceButtons()];
                        },
                    },
                },
                {
                    p: {
                        className: "note",
                        hidden: () => !error(),
                        textContent: () => error(),
                    },
                },
                {
                    div: {
                        className: "continue",
                        hidden: () => {
                            const data = saved();
                            return !data || (!data.hosts.length && !data.tickets.length);
                        },
                        children: () => {
                            const data = saved();
                            if (!data) return [];
                            const items = [
                                ...data.hosts.map((host) => ({
                                    li: {
                                        key: `h-${host.code}`,
                                        children: [{
                                            a: {
                                                className: "saved",
                                                href: `/h/${host.code}`,
                                                children: [
                                                    { span: { className: "saved-name", textContent: host.name } },
                                                    { span: { className: "saved-meta", textContent: host.code } },
                                                ],
                                            },
                                        }],
                                    },
                                })),
                                ...data.tickets.map((ticket) => ({
                                    li: {
                                        key: `t-${ticket.code}`,
                                        children: [{
                                            a: {
                                                className: "saved",
                                                href: `/s/${ticket.code}`,
                                                children: [
                                                    { span: { className: "saved-name", textContent: String(ticket.n) } },
                                                    { span: { className: "saved-meta", textContent: ticket.code } },
                                                ],
                                            },
                                        }],
                                    },
                                })),
                            ];
                            return [
                                { h2: { textContent: "On this phone" } },
                                { ul: { className: "saved-list", children: items } },
                            ];
                        },
                    },
                },
            ],
        },
    };
}

function placeOf(current, n) {
    if (!current?.exists || n == null) return "";
    if (current.serving === n) return "You're up.";
    if (current.waiting?.includes(n)) {
        const ahead = current.waiting.filter((item) => item < n).length;
        if (ahead === 0) return "You're next.";
        return ahead === 1 ? "1 person ahead of you." : `${ahead} people ahead of you.`;
    }
    if (current.removed?.includes(n)) return "Your number was removed.";
    if (n <= current.issued) return "Your number has already been called.";
    return "";
}

function holding(current, n) {
    if (!current?.exists || n == null) return false;
    return current.serving === n || Boolean(current.waiting?.includes(n));
}

// A number the board has already finished. A number past `issued` belongs to a
// snapshot that has not caught up, so it is not offered a new one yet.
function needsNew(current, n) {
    if (!current?.exists || !Number.isInteger(n) || current.closed) return false;
    if (holding(current, n)) return false;
    return n <= (current.issued ?? 0);
}

function issuedFor(api, code) {
    const assigned = api.getState("ticket");
    if (assigned?.code === code && Number.isInteger(assigned.n)) return assigned;
    const n = ticketOf(code);
    return n == null ? null : { code, n, name: "" };
}

export function Ticket(props, api) {
    const initial = canonCode(api.getState("$route.params.code"));
    let stopLive = api.live("board", "board", initial) ?? (() => {});
    const seeded = issuedFor(api, initial);
    const serverError = api.getState("ticketError");
    const [mine, setMine] = api.useState("mine", seeded?.n ?? null);
    const [error, setError] = api.useState("error", serverError?.code === initial ? serverError.message : "");
    const [pending, setPending] = api.useState("pending", false);
    const codeNow = () => canonCode(api.getState("$route.params.code"));
    const board = () => api.getState("board");
    let again = () => {};

    api.onMount(() => {
        let busy = false;
        const claim = async (code, force) => {
            const held = force ? null : issuedFor(api, code);
            if (held) {
                rememberTicket(code, held.n, held.name || api.getState("board.name"));
                setMine(held.n);
                return;
            }
            if (busy) return;
            busy = true;
            setPending(true);
            setError("");
            try {
                const taken = await api.call("takeTicket", code, deviceId());
                rememberTicket(code, taken.n, taken.name);
                setMine(taken.n);
            } catch (failure) {
                setError(errorMessage(failure));
                setMine(ticketOf(code));
            } finally {
                busy = false;
                setPending(false);
            }
        };
        again = () => claim(codeNow(), true);
        let subscribed = initial;
        const stopWatch = api.bindState(() => codeNow(), (next) => {
            const known = issuedFor(api, next);
            if (known) {
                rememberTicket(next, known.n, known.name || api.getState("board.name"));
                setMine(known.n);
            } else {
                claim(next, false);
            }
            if (next === subscribed) return;
            stopLive();
            subscribed = next;
            setError("");
            stopLive = api.live("board", "board", next) ?? (() => {});
        });
        const stopGone = api.bindState(
            () => api.getState("board.exists"),
            (exists) => {
                if (exists !== false) return;
                forgetTicket(codeNow());
                setMine(null);
            },
        );
        const stopDevice = onDeviceChange(() => setMine(ticketOf(codeNow())));
        api.onCleanup(() => {
            stopWatch();
            stopGone();
            stopDevice();
            stopLive();
        });
    });

    const view = () => {
        const current = board();
        if (!current) return "opening";
        if (!current.exists) return "missing";
        return "ticket";
    };

    return {
        section: {
            className: "ticket",
            children: [
                {
                    div: {
                        className: "hero stack",
                        hidden: () => view() === "missing",
                        children: [
                            wordmark(),
                            { h1: { textContent: () => board()?.name || "Queue" } },
                            { p: { className: "kicker", textContent: "Your number" } },
                            {
                                p: {
                                    className: "number",
                                    hidden: () => mine() == null,
                                    textContent: () => displayNumber(mine()),
                                },
                            },
                            {
                                p: {
                                    className: "status",
                                    hidden: () => mine() != null || Boolean(error()) || view() === "opening",
                                    textContent: "Getting your number…",
                                },
                            },
                            {
                                p: {
                                    className: "place",
                                    hidden: () => !placeOf(board(), mine()),
                                    textContent: () => placeOf(board(), mine()),
                                },
                            },
                            {
                                button: {
                                    className: "primary",
                                    type: "button",
                                    hidden: () => pending() || !needsNew(board(), mine()),
                                    onclick: () => again(),
                                    textContent: "New number",
                                },
                            },
                            {
                                button: {
                                    className: "primary",
                                    type: "button",
                                    hidden: () => !error() || mine() != null,
                                    onclick: () => again(),
                                    textContent: "Try again",
                                },
                            },
                            {
                                p: {
                                    className: "note",
                                    hidden: () => !error(),
                                    textContent: () => error(),
                                },
                            },
                        ],
                    },
                },
                {
                    div: {
                        className: "aside",
                        hidden: () => view() !== "ticket",
                        children: [
                            {
                                p: {
                                    className: "status",
                                    hidden: () => {
                                        const state = api.liveState("board");
                                        return state !== "offline" && state !== "failed";
                                    },
                                    textContent: () => (api.liveState("board") === "failed"
                                        ? (api.liveMessage("board") || "The queue is not updating.")
                                        : "Reconnecting…"),
                                },
                            },
                            {
                                p: {
                                    className: "serving-line",
                                    children: [
                                        "Now serving ",
                                        { strong: { textContent: () => displayNumber(board()?.serving) } },
                                    ],
                                },
                            },
                            {
                                p: {
                                    className: "waiting-count",
                                    textContent: () => {
                                        const count = board()?.waiting?.length ?? 0;
                                        if (count === 0) return "No one waiting";
                                        return count === 1 ? "1 waiting" : `${count} waiting`;
                                    },
                                },
                            },
                            {
                                p: {
                                    className: "banner",
                                    hidden: () => !board()?.closed,
                                    textContent: "This queue is closed.",
                                },
                            },
                        ],
                    },
                },
                {
                    div: {
                        className: "hero stack",
                        hidden: () => view() !== "missing",
                        children: [
                            wordmark(),
                            { h1: { textContent: "This queue is gone" } },
                            {
                                p: {
                                    className: "lede",
                                    textContent: "It was deleted, or the server restarted and forgot it.",
                                },
                            },
                            { a: { className: "primary link", href: "/", textContent: "Back home" } },
                        ],
                    },
                },
                {
                    p: {
                        className: "status",
                        hidden: () => view() !== "opening",
                        textContent: "Opening the queue…",
                    },
                },
            ],
        },
    };
}

export function Counter(props, api) {
    const initial = canonCode(api.getState("$route.params.code"));
    let stopLive = api.live("board", "board", initial) ?? (() => {});
    const [ready, setReady] = api.useState("ready", false);
    const [paired, setPaired] = api.useState("paired", false);
    const [room, setRoom] = api.useState("room", false);
    const [pane, setPane] = api.useState("pane", "now");
    const [share, setShare] = api.useState("share", "customers");
    const [confirm, setConfirm] = api.useState("confirm", false);
    const [pairInput, setPairInput] = api.useState("pairInput", "");
    const [error, setError] = api.useState("error", "");
    const [notice, setNotice] = api.useState("notice", "");
    const [pending, setPending] = api.useState("pending", false);
    const codeNow = () => canonCode(api.getState("$route.params.code"));
    const board = () => api.getState("board");

    api.onMount(() => {
        api.setValue("origin", location.origin);
        let subscribed = initial;
        const stopWatch = api.bindState(() => codeNow(), (next) => {
            setPaired(Boolean(hostOf(next)));
            setReady(true);
            setRoom(false);
            setConfirm(false);
            setError("");
            setNotice("");
            if (next === subscribed) return;
            stopLive();
            subscribed = next;
            stopLive = api.live("board", "board", next) ?? (() => {});
        });
        const stopGone = api.bindState(
            () => api.getState("board.exists"),
            (exists) => {
                if (exists !== false) return;
                const code = codeNow();
                forgetHost(code);
                forgetTicket(code);
                setPaired(false);
                setRoom(false);
            },
        );
        const stopDevice = onDeviceChange(() => {
            if (hostOf(codeNow())) {
                setPaired(true);
                return;
            }
            setPaired(false);
            setRoom(false);
            setConfirm(false);
        });
        api.onCleanup(() => {
            stopWatch();
            stopGone();
            stopDevice();
            stopLive();
        });
    });

    const view = () => {
        const current = board();
        if (!current) return "opening";
        if (!current.exists) return "missing";
        if (!ready()) return "opening";
        if (room() && paired()) return "room";
        if (!paired()) return "join";
        return "desk";
    };

    function pairFor(code) {
        return hostOf(code)?.pair ?? "";
    }

    async function run(action) {
        if (pending()) return;
        const code = codeNow();
        const pair = pairFor(code);
        if (!pair) {
            setError("Pair this phone before running the queue.");
            return;
        }
        setPending(true);
        setError("");
        setNotice("");
        try {
            await action(code, pair);
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            setPending(false);
        }
    }

    function next() {
        return run((code, pair) => api.call("callNext", code, pair));
    }

    function skip() {
        return run(async (code, pair) => {
            const serving = api.getState("board.serving");
            const hadWaiting = (api.getState("board.waiting") ?? []).length > 0;
            if (serving == null) return;
            await api.call("removeTicket", code, pair, serving);
            if (hadWaiting) await api.call("callNext", code, pair);
        });
    }

    function remove(n) {
        return run((code, pair) => api.call("removeTicket", code, pair, n));
    }

    function toggleClosed() {
        return run((code, pair) => {
            const name = api.getState("board.closed") ? "reopenSession" : "closeSession";
            return api.call(name, code, pair);
        });
    }

    async function unlock(event) {
        event.preventDefault();
        if (pending()) return;
        const code = codeNow();
        const pair = canonPair(pairInput());
        if (!isPair(pair)) {
            setError("Enter the six-character pairing code.");
            return;
        }
        setPending(true);
        setError("");
        try {
            const unlocked = await api.call("unlock", code, pair);
            rememberHost(unlocked.code, pair, unlocked.name);
            setPaired(true);
            setNotice("This phone can run the queue.");
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            setPending(false);
        }
    }

    function forget() {
        forgetHost(codeNow());
        setPaired(false);
        setRoom(false);
        setConfirm(false);
        setNotice("This phone no longer runs the queue.");
    }

    async function destroy() {
        if (pending()) return;
        const code = codeNow();
        const pair = pairFor(code);
        if (!pair) {
            setPaired(false);
            setConfirm(false);
            setError("Pair this phone before running the queue.");
            return;
        }
        setPending(true);
        setError("");
        try {
            await api.call("deleteSession", code, pair);
            forgetHost(code);
            forgetTicket(code);
            await api.navigate("/", { replace: true });
        } catch (failure) {
            setError(errorMessage(failure));
            setPending(false);
        }
    }

    async function copy(text) {
        try {
            await navigator.clipboard.writeText(text);
            setNotice("Copied.");
        } catch {
            setNotice("The code is on the screen if copying is blocked.");
        }
    }

    function customerUrl() {
        const origin = api.getState("origin");
        return origin ? `${origin}/s/${codeNow()}` : "";
    }

    function pairUrl() {
        const origin = api.getState("origin");
        const pair = pairFor(codeNow());
        return origin && pair ? `${origin}/pair/${codeNow()}#${pair}` : "";
    }

    function nextLabel() {
        const current = board();
        if (current?.serving && !current.waiting?.length) return "Finish";
        if (!current?.serving && current?.waiting?.length) return "Call next";
        return "Next";
    }

    function tab(id, label) {
        return {
            button: {
                type: "button",
                classList: { "is-on": () => pane() === id },
                onclick: () => setPane(id),
                textContent: label,
            },
        };
    }

    return {
        section: {
            className: "shell",
            children: [
                {
                    div: {
                        className: "center",
                        hidden: () => view() === "desk" || view() === "room",
                        children: () => {
                            if (view() === "missing") {
                                return [{
                                    div: {
                                        className: "center-card stack",
                                        children: [
                                            wordmark(),
                                            { h1: { textContent: "This queue is gone" } },
                                            {
                                                p: {
                                                    className: "lede",
                                                    textContent: "It was deleted, or the server restarted and forgot it.",
                                                },
                                            },
                                            { a: { className: "primary link", href: "/", textContent: "Back home" } },
                                        ],
                                    },
                                }];
                            }
                            if (view() === "join") {
                                return [{
                                    form: {
                                        className: "center-card stack",
                                        onsubmit: unlock,
                                        children: [
                                            wordmark(),
                                            { h1: { textContent: () => board()?.name || "Queue" } },
                                            {
                                                p: {
                                                    className: "lede",
                                                    textContent: "Enter the pairing code to run this queue here.",
                                                },
                                            },
                                            textField({
                                                id: "host-pair",
                                                label: "Pairing code",
                                                value: () => pairInput(),
                                                set: setPairInput,
                                                maxlength: 11,
                                                autocapitalize: "characters",
                                                placeholder: "ABC DEF",
                                            }),
                                            {
                                                button: {
                                                    className: "primary",
                                                    type: "submit",
                                                    disabled: () => pending(),
                                                    textContent: () => (pending() ? "Checking…" : "Use this phone"),
                                                },
                                            },
                                        ],
                                    },
                                }];
                            }
                            return [{ p: { className: "status", textContent: "Checking this phone…" } }];
                        },
                    },
                },
                {
                    div: {
                        className: "desk",
                        hidden: () => view() !== "desk" && view() !== "room",
                        children: [
                            {
                                header: {
                                    className: "topbar",
                                    children: [
                                        {
                                            div: {
                                                className: "stack",
                                                children: [
                                                    wordmark(),
                                                    { h1: { textContent: () => board()?.name || "Queue" } },
                                                ],
                                            },
                                        },
                                        {
                                            div: {
                                                className: "stack",
                                                children: [
                                                    {
                                                        p: {
                                                            className: "code",
                                                            translate: "no",
                                                            textContent: () => spaced(codeNow()),
                                                        },
                                                    },
                                                    {
                                                        button: {
                                                            className: "text",
                                                            type: "button",
                                                            onclick: toggleClosed,
                                                            disabled: () => pending(),
                                                            textContent: () => (board()?.closed ? "Open queue" : "Close queue"),
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                            {
                                div: {
                                    className: "pane stage",
                                    classList: { "is-on": () => pane() === "now" },
                                    children: [
                                        { p: { className: "kicker", textContent: "Now serving" } },
                                        {
                                            p: {
                                                className: "number",
                                                "aria-live": "polite",
                                                textContent: () => displayNumber(board()?.serving),
                                            },
                                        },
                                        {
                                            p: {
                                                className: "waiting-count",
                                                textContent: () => {
                                                    const count = board()?.waiting?.length ?? 0;
                                                    if (count === 0) return "No one waiting";
                                                    return count === 1 ? "1 waiting" : `${count} waiting`;
                                                },
                                            },
                                        },
                                        {
                                            p: {
                                                className: "banner",
                                                hidden: () => !board()?.closed,
                                                textContent: "Closed to new numbers.",
                                            },
                                        },
                                        {
                                            p: {
                                                className: "status",
                                                hidden: () => {
                                                    const state = api.liveState("board");
                                                    return state !== "offline" && state !== "failed";
                                                },
                                                textContent: () => (api.liveState("board") === "failed"
                                                    ? (api.liveMessage("board") || "The queue is not updating.")
                                                    : "Reconnecting…"),
                                            },
                                        },
                                        {
                                            div: {
                                                className: "stage-actions",
                                                children: [
                                                    {
                                                        button: {
                                                            className: "primary",
                                                            type: "button",
                                                            onclick: next,
                                                            disabled: () => pending()
                                                                || (!board()?.serving && !(board()?.waiting?.length)),
                                                            textContent: () => (pending() ? "Working…" : nextLabel()),
                                                        },
                                                    },
                                                    {
                                                        button: {
                                                            className: "ghost",
                                                            type: "button",
                                                            hidden: () => board()?.serving == null,
                                                            onclick: skip,
                                                            disabled: () => pending(),
                                                            textContent: "Skip",
                                                        },
                                                    },
                                                    {
                                                        button: {
                                                            className: "ghost",
                                                            type: "button",
                                                            onclick: () => setRoom(true),
                                                            textContent: "Show to the room",
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                            {
                                div: {
                                    className: "pane line",
                                    classList: { "is-on": () => pane() === "line" },
                                    children: [
                                        { h2: { textContent: "Waiting" } },
                                        {
                                            p: {
                                                className: "lede",
                                                hidden: () => (board()?.waiting?.length ?? 0) > 0,
                                                textContent: "No one is waiting.",
                                            },
                                        },
                                        {
                                            ol: {
                                                className: "queue",
                                                children: () => (board()?.waiting ?? []).map((n) => ({
                                                    li: {
                                                        key: n,
                                                        className: "queue-row",
                                                        children: [
                                                            { span: { className: "queue-num", textContent: String(n) } },
                                                            {
                                                                button: {
                                                                    type: "button",
                                                                    onclick: () => remove(n),
                                                                    disabled: () => pending(),
                                                                    textContent: "Remove",
                                                                },
                                                            },
                                                        ],
                                                    },
                                                })),
                                            },
                                        },
                                    ],
                                },
                            },
                            {
                                div: {
                                    className: "pane share",
                                    classList: { "is-on": () => pane() === "share" },
                                    children: [
                                        {
                                            div: {
                                                className: "share-switch",
                                                children: [
                                                    {
                                                        button: {
                                                            type: "button",
                                                            classList: { "is-on": () => share() === "customers" },
                                                            onclick: () => setShare("customers"),
                                                            textContent: "Customers",
                                                        },
                                                    },
                                                    {
                                                        button: {
                                                            type: "button",
                                                            classList: { "is-on": () => share() === "phone" },
                                                            onclick: () => setShare("phone"),
                                                            textContent: "Add a phone",
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                        {
                                            div: {
                                                className: "share-block",
                                                classList: { "is-on": () => share() === "customers" },
                                                children: [
                                                    {
                                                        div: {
                                                            children: () => [qrLayout(customerUrl(), "Customer code")],
                                                        },
                                                    },
                                                    {
                                                        div: {
                                                            className: "stack",
                                                            children: [
                                                                { h2: { textContent: "Customers" } },
                                                                {
                                                                    p: {
                                                                        className: "lede",
                                                                        textContent: "They scan this and get a number.",
                                                                    },
                                                                },
                                                                {
                                                                    p: {
                                                                        className: "code",
                                                                        translate: "no",
                                                                        textContent: () => spaced(codeNow()),
                                                                    },
                                                                },
                                                                {
                                                                    p: {
                                                                        className: "hint",
                                                                        hidden: () => !onThisMachine(api.getState("origin")),
                                                                        textContent: "Open this page from the public address before showing the code.",
                                                                    },
                                                                },
                                                                {
                                                                    button: {
                                                                        className: "ghost",
                                                                        type: "button",
                                                                        onclick: () => copy(customerUrl()),
                                                                        textContent: "Copy customer link",
                                                                    },
                                                                },
                                                            ],
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                        {
                                            div: {
                                                className: "share-block",
                                                classList: { "is-on": () => share() === "phone" },
                                                children: [
                                                    {
                                                        div: {
                                                            children: () => [qrLayout(paired() ? pairUrl() : "", "Pairing code")],
                                                        },
                                                    },
                                                    {
                                                        div: {
                                                            className: "stack",
                                                            children: [
                                                                { h2: { textContent: "Add a phone" } },
                                                                {
                                                                    p: {
                                                                        className: "lede",
                                                                        textContent: "Scan this to let another phone call the next number.",
                                                                    },
                                                                },
                                                                {
                                                                    p: {
                                                                        className: "code",
                                                                        translate: "no",
                                                                        textContent: () => (paired() ? spaced(pairFor(codeNow())) : ""),
                                                                    },
                                                                },
                                                                {
                                                                    button: {
                                                                        className: "ghost",
                                                                        type: "button",
                                                                        onclick: () => copy(pairUrl()),
                                                                        textContent: "Copy pairing link",
                                                                    },
                                                                },
                                                            ],
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                        {
                                            div: {
                                                className: "quiet",
                                                children: [
                                                    {
                                                        button: {
                                                            className: "text",
                                                            type: "button",
                                                            onclick: forget,
                                                            textContent: "Forget this phone",
                                                        },
                                                    },
                                                    {
                                                        button: {
                                                            className: "text danger",
                                                            type: "button",
                                                            hidden: () => confirm(),
                                                            onclick: () => setConfirm(true),
                                                            textContent: "Delete queue",
                                                        },
                                                    },
                                                    {
                                                        button: {
                                                            className: "text danger",
                                                            type: "button",
                                                            hidden: () => !confirm(),
                                                            onclick: destroy,
                                                            disabled: () => pending(),
                                                            textContent: "Yes, delete it",
                                                        },
                                                    },
                                                    {
                                                        button: {
                                                            className: "text",
                                                            type: "button",
                                                            hidden: () => !confirm(),
                                                            onclick: () => setConfirm(false),
                                                            textContent: "Keep it",
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                            {
                                nav: {
                                    className: "tabs",
                                    children: [
                                        tab("now", "Now"),
                                        tab("line", () => {
                                            const count = board()?.waiting?.length ?? 0;
                                            return count ? `Line ${count}` : "Line";
                                        }),
                                        tab("share", "Share"),
                                    ],
                                },
                            },
                        ],
                    },
                },
                {
                    div: {
                        className: "room",
                        hidden: () => view() !== "room",
                        children: [
                            { p: { className: "kicker", textContent: () => board()?.name || "Queue" } },
                            { p: { className: "kicker", textContent: "Now serving" } },
                            {
                                p: {
                                    className: "number",
                                    textContent: () => displayNumber(board()?.serving),
                                },
                            },
                            { div: { children: () => [qrLayout(customerUrl(), "Scan to take a number")] } },
                            {
                                p: {
                                    className: "code",
                                    translate: "no",
                                    textContent: () => spaced(codeNow()),
                                },
                            },
                            {
                                button: {
                                    className: "ghost",
                                    type: "button",
                                    onclick: () => setRoom(false),
                                    textContent: "Back to the counter",
                                },
                            },
                        ],
                    },
                },
                {
                    p: {
                        className: "toast note",
                        hidden: () => !error(),
                        textContent: () => error(),
                    },
                },
                {
                    p: {
                        className: "toast",
                        hidden: () => !notice() || Boolean(error()),
                        textContent: () => notice(),
                    },
                },
            ],
        },
    };
}

export function Pair(props, api) {
    const initial = canonCode(api.getState("$route.params.code"));
    api.live("board", "board", initial);
    const [pairInput, setPairInput] = api.useState("pairInput", "");
    const [auto, setAuto] = api.useState("auto", false);
    const [error, setError] = api.useState("error", "");
    const [pending, setPending] = api.useState("pending", false);
    const codeNow = () => canonCode(api.getState("$route.params.code"));
    const board = () => api.getState("board");

    async function submit(pair) {
        const code = codeNow();
        const canon = canonPair(pair);
        if (!isPair(canon)) {
            setAuto(false);
            setError("Enter the six-character pairing code.");
            return;
        }
        setPending(true);
        setError("");
        try {
            const unlocked = await api.call("unlock", code, canon);
            rememberHost(unlocked.code, canon, unlocked.name);
            await api.navigate(`/h/${unlocked.code}`, { replace: true });
        } catch (failure) {
            setAuto(false);
            setError(errorMessage(failure));
            setPending(false);
        }
    }

    api.onMount(() => {
        const pair = canonPair(location.hash.replace(/^#/, ""));
        if (!isPair(pair)) return;
        setPairInput(spaced(pair));
        setAuto(true);
        submit(pair);
    });

    return {
        section: {
            className: "center",
            children: [
                {
                    div: {
                        className: "center-card stack",
                        children: [
                            wordmark(),
                            {
                                h1: {
                                    textContent: () => (board()?.exists
                                        ? board().name
                                        : "Add this phone"),
                                },
                            },
                            {
                                p: {
                                    className: "lede",
                                    hidden: () => board()?.exists !== false,
                                    textContent: "That queue is not on the server.",
                                },
                            },
                            {
                                p: {
                                    className: "status",
                                    hidden: () => !auto() || Boolean(error()),
                                    textContent: "Adding this phone…",
                                },
                            },
                            {
                                form: {
                                    className: "stack",
                                    hidden: () => board()?.exists === false || (auto() && !error()),
                                    onsubmit: (event) => {
                                        event.preventDefault();
                                        submit(pairInput());
                                    },
                                    children: [
                                        textField({
                                            id: "pair-code",
                                            label: "Pairing code",
                                            value: () => pairInput(),
                                            set: setPairInput,
                                            maxlength: 11,
                                            autocapitalize: "characters",
                                            placeholder: "ABC DEF",
                                        }),
                                        {
                                            button: {
                                                className: "primary",
                                                type: "submit",
                                                disabled: () => pending(),
                                                textContent: () => (pending() ? "Checking…" : "Use this phone"),
                                            },
                                        },
                                    ],
                                },
                            },
                            {
                                p: {
                                    className: "note",
                                    hidden: () => !error(),
                                    textContent: () => error(),
                                },
                            },
                        ],
                    },
                },
            ],
        },
    };
}

export function Missing() {
    return {
        section: {
            className: "center",
            children: [
                {
                    div: {
                        className: "center-card stack",
                        children: [
                            wordmark(),
                            { h1: { textContent: "Nothing here" } },
                            { p: { className: "lede", textContent: "That page is not part of Queue Order." } },
                            { a: { className: "primary link", href: "/", textContent: "Back home" } },
                        ],
                    },
                },
            ],
        },
    };
}
