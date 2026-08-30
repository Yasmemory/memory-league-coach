export function getOfficialModeDetails(officialTournamentName?: string, officialRound?: string, opponentName?: string) {
  const tournamentName = officialTournamentName ?? "";
  const matchDetails = [officialRound, opponentName ? `vs ${opponentName}` : undefined].filter(Boolean).join(" / ");
  return {
    tournamentName,
    matchDetails,
    title: [tournamentName, matchDetails].filter(Boolean).join(" / "),
  };
}
