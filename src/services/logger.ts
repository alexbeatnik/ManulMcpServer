export interface ManulLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  step(message: string): void;
  debug(label: string, value: unknown): void;
}