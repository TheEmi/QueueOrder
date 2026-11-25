import { canonCode } from "./codes.js";
import { Home, Ticket, Counter, Pair, Missing } from "./pages.js";

const queueTitle = (board) => (board?.exists ? board.name : "No queue");

export const routes = [
    {
        path: "/",
        name: "home",
        component: "Home",
        head: {
            title: "Queue Order",
            description: "Open a queue, let people take a number, and call the next one.",
        },
    },
    {
        path: "/s/:code",
        name: "ticket",
        component: "Ticket",
        preload: ({ params }) => [["board", canonCode(params.code)]],
        head: { titleFrom: queueTitle },
    },
    {
        path: "/h/:code",
        name: "counter",
        component: "Counter",
        preload: ({ params }) => [["board", canonCode(params.code)]],
        head: { titleFrom: queueTitle },
    },
    {
        path: "/pair/:code",
        name: "pair",
        component: "Pair",
        preload: ({ params }) => [["board", canonCode(params.code)]],
        head: { title: "Add a phone" },
    },
    {
        path: "*",
        name: "missing",
        component: "Missing",
        head: { title: "Not found" },
    },
];

export const title = { suffix: " · Queue Order", fallback: "Queue Order" };

export function register(juris) {
    juris.registerComponent("App", () => ({
        main: { className: "app", children: [{ RouterView: {} }] },
    }));
    juris.registerComponent("Home", Home);
    juris.registerComponent("Ticket", Ticket);
    juris.registerComponent("Counter", Counter);
    juris.registerComponent("Pair", Pair);
    juris.registerComponent("Missing", Missing);
}
