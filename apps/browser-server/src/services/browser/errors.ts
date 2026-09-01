export class LocalStorageRequiresUrlError extends Error {}

export class RecordingNotConfiguredError extends Error {}

/** A session asked for a context but this server has no storage configured. */
export class ContextNotStoredError extends Error {}

/** A session named a `timeoutMs` outside the range this server will honour. */
export class InvalidTimeoutError extends Error {}
