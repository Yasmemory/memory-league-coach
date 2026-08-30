export function getOfficialModeDetails(officialTournamentName?: string, officialRound?: string, opponentName?: string) {
  return [officialTournamentName, officialRound, opponentName ? `vs ${opponentName}` : undefined].filter(Boolean).join(" / ");
}
