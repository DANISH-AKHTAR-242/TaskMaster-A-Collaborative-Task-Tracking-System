export function notificationRecipients(
  actorUserId: string,
  candidates: readonly string[],
): string[] {
  return [...new Set(candidates)].filter((id) => id !== actorUserId).sort();
}
