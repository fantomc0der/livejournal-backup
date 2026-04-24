import * as clack from "@clack/prompts";
import pc from "picocolors";
import { Logger } from "./logger.ts";

type SpinnerInstance = ReturnType<typeof clack.spinner>;
interface ProgressInstance {
  message(text: string): void;
}

export function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

export class TuiLogger extends Logger {
  private activeSpinner: SpinnerInstance | null = null;
  private activeProgress: ProgressInstance | null = null;
  private isVerbose: boolean;

  constructor(verbose: boolean) {
    super(verbose);
    this.isVerbose = verbose;
  }

  setSpinner(spinner: SpinnerInstance): void {
    this.activeSpinner = spinner;
  }

  clearSpinner(): void {
    this.activeSpinner = null;
  }

  setProgress(progress: ProgressInstance): void {
    this.activeProgress = progress;
  }

  clearProgress(): void {
    this.activeProgress = null;
  }

  override info(message: string): void {
    if (this.activeSpinner || this.activeProgress) return;
    clack.log.info(message);
  }

  override log(message: string): void {
    if (this.activeSpinner || this.activeProgress) return;
    clack.log.message(message);
  }

  override debug(message: string): void {
    if (!this.isVerbose) return;
    if (this.activeSpinner) {
      this.activeSpinner.message(pc.dim(message));
      return;
    }
    if (this.activeProgress) {
      this.activeProgress.message(pc.dim(message));
      return;
    }
    clack.log.message(pc.dim(message));
  }

  // Warnings and errors from retries are surfaced via spinner.message()
  // to avoid terminal corruption from stop()/start() mid-animation.
  override warn(message: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.message(pc.yellow(message));
      return;
    }
    if (this.activeProgress) {
      this.activeProgress.message(pc.yellow(message));
      return;
    }
    clack.log.warn(pc.yellow(message));
  }

  override error(message: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.message(pc.red(message));
      return;
    }
    if (this.activeProgress) {
      this.activeProgress.message(pc.red(message));
      return;
    }
    clack.log.error(pc.red(message));
  }
}
