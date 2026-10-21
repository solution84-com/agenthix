/** A value as JSON carries it: what crosses the client protocol where its shape is the sender's own (a tool's input). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
