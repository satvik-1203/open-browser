export class LocalStorageRequiresUrlError extends Error {}

export class RecordingNotConfiguredError extends Error {}

/** A session asked for a context but this server has no storage configured. */
export class ContextNotStoredError extends Error {}
