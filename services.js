import { createStore } from "./store.js";

export function createServices(store = createStore()) {
    return {
        board: (code) => store.board(code),
        createSession: (name) => store.create(name),
        takeTicket: (code, deviceId) => store.take(code, deviceId),
        callNext: (code, pair) => store.next(code, pair),
        removeTicket: (code, pair, n) => store.remove(code, pair, n),
        closeSession: (code, pair) => store.close(code, pair),
        reopenSession: (code, pair) => store.reopen(code, pair),
        deleteSession: (code, pair) => store.delete(code, pair),
        unlock: (code, pair) => store.unlock(code, pair),
    };
}

export const services = createServices();
