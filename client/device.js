// What this phone remembers. The server keeps the queue; the phone keeps which
// queue it runs and which number it took, so a reload brings the same one back.
const KEY = "queue-order.v1";
export const DEVICE_COOKIE = "qd";

export function readCookieDevice(header) {
    const parts = String(header ?? "").split(";");
    for (const part of parts) {
        const [name, ...rest] = part.trim().split("=");
        const value = rest.join("=");
        if (name === DEVICE_COOKIE && /^[0-9a-f-]{36}$/i.test(value)) return value.toLowerCase();
    }
    return "";
}

function browserCookie() {
    if (typeof document === "undefined") return "";
    return readCookieDevice(document.cookie);
}

function rememberCookie(id) {
    if (typeof document === "undefined") return;
    document.cookie = `${DEVICE_COOKIE}=${id}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function empty() {
    return { deviceId: "", hosts: {}, tickets: {} };
}

function load() {
    if (typeof localStorage === "undefined") return empty();
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return empty();
        const data = JSON.parse(raw);
        return {
            deviceId: typeof data.deviceId === "string" ? data.deviceId : "",
            hosts: data.hosts && typeof data.hosts === "object" ? data.hosts : {},
            tickets: data.tickets && typeof data.tickets === "object" ? data.tickets : {},
        };
    } catch {
        return empty();
    }
}

function save(data) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify(data));
}

export function deviceId() {
    const data = load();
    const stored = /^[0-9a-f-]{36}$/i.test(data.deviceId) ? data.deviceId.toLowerCase() : "";
    const id = browserCookie() || stored || crypto.randomUUID();
    if (data.deviceId !== id) {
        data.deviceId = id;
        save(data);
    }
    rememberCookie(id);
    return id;
}

export function rememberHost(code, pair, name) {
    const data = load();
    data.hosts[code] = { pair, name: name || "Queue" };
    save(data);
}

export function forgetHost(code) {
    const data = load();
    delete data.hosts[code];
    save(data);
}

export function hostOf(code) {
    const host = load().hosts[code];
    if (!host || typeof host.pair !== "string") return null;
    return { pair: host.pair, name: host.name || "Queue" };
}

export function savedHosts() {
    return Object.entries(load().hosts)
        .filter(([, host]) => typeof host?.pair === "string")
        .map(([code, host]) => ({ code, name: host.name || "Queue" }));
}

export function rememberTicket(code, n, name) {
    const data = load();
    data.tickets[code] = { n, name: name || "Queue" };
    save(data);
}

export function forgetTicket(code) {
    const data = load();
    delete data.tickets[code];
    save(data);
}

export function ticketOf(code) {
    const ticket = load().tickets[code];
    return Number.isInteger(ticket?.n) ? ticket.n : null;
}

// Other tabs of this phone hear localStorage writes through the storage event.
// The tab that wrote the value does not, so it updates its own screen directly.
export function onDeviceChange(listener) {
    if (typeof window === "undefined") return () => {};
    const wrapped = (event) => {
        if (event.key !== KEY) return;
        listener();
    };
    window.addEventListener("storage", wrapped);
    return () => window.removeEventListener("storage", wrapped);
}

export function savedTickets() {
    return Object.entries(load().tickets)
        .filter(([, ticket]) => Number.isInteger(ticket?.n))
        .map(([code, ticket]) => ({
            code,
            n: ticket.n,
            name: ticket.name || "Queue",
        }));
}
