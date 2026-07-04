export class BrowserServerError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BrowserServerError";
    this.status = status;
  }
}
