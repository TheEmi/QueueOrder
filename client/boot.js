import { hydrate } from "/src/client.js";
import { routes, register, title } from "./app.js";

export const start = () => hydrate({ routes, register, title });
