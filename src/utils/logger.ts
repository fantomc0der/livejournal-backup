export type LogLevel = "silent" | "info" | "verbose" | "debug";

export class Logger {
  private verbose: boolean;

  constructor(verbose: boolean) {
    this.verbose = verbose;
  }

  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  log(message: string): void {
    console.log(message);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(`[DEBUG] ${message}`);
    }
  }

  warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }

  error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }
}
