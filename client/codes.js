// Codes a person can read aloud. No 0/O or 1/I.
export const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const CODE = new RegExp(`^[${ALPHABET}]{4}$`);
const PAIR = new RegExp(`^[${ALPHABET}]{6}$`);

export function canonCode(value) {
    return String(value ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
}

export function canonPair(value) {
    return canonCode(value);
}

export function isCode(value) {
    return CODE.test(value);
}

export function isPair(value) {
    return PAIR.test(value);
}

export function spaced(value) {
    const text = String(value ?? "");
    if (text.length <= 3) return text;
    const mid = Math.ceil(text.length / 2);
    return `${text.slice(0, mid)} ${text.slice(mid)}`;
}
