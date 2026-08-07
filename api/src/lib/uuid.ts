export function newId(): string {
  return crypto.randomUUID();
}

export function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}
