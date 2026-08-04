import type {
  RetirementMvpEntry,
  RetirementSummary,
  RetirementSummaryService,
  RetirementTrophyEntry,
} from '../retirement';
import type { PlayerProfile } from '../profile';

export class RetirementSummaryServiceImpl implements RetirementSummaryService {
  public async generate(input: { readonly player: PlayerProfile }): Promise<RetirementSummary> {
    const player = this.copy(input.player);
    if (!player.isRetired || !player.retiredAt) {
      throw new Error('RetirementSummary can only be generated for a retired player with retiredAt set.');
    }

    const archive = [...player.tournamentArchive].sort((left, right) => left.year - right.year || left.editionId.localeCompare(right.editionId));
    const trophyRoom: RetirementTrophyEntry[] = archive
      .filter((record): record is typeof record & { readonly level: 'T1' | 'MAJOR'; readonly trophyAssetId: NonNullable<typeof record.trophyAssetId> } => (
        record.champion && record.trophyAssetId !== null && (record.level === 'T1' || record.level === 'MAJOR')
      ))
      .map((record) => ({
        editionId: record.editionId,
        year: record.year,
        fullName: record.fullName,
        organizerId: record.organizerId,
        level: record.level,
        trophyAssetId: record.trophyAssetId,
      }));
    const mvpRoom: RetirementMvpEntry[] = archive
      .filter((record) => record.mvp !== null)
      .map((record) => ({
        editionId: record.editionId,
        year: record.year,
        fullName: record.fullName,
        organizerId: record.organizerId,
        level: record.mvp,
        badgeAssetId: record.mvp === 'MAJOR' ? 'golden_mvp' : 'sliver_mvp',
      }));
    const top20History = [...player.trophies.top20Records]
      .map((record) => ({ year: record.year, rank: record.rank }))
      .sort((left, right) => left.year - right.year || left.rank - right.rank);
    const majorMvpCount = mvpRoom.filter((entry) => entry.level === 'MAJOR').length;
    const peakRating = archive.reduce((peak, record) => Math.max(peak, record.rating), 0);
    const ratingSeasons = new Map<number, number[]>();
    for (const record of archive) ratingSeasons.set(record.year, [...(ratingSeasons.get(record.year) ?? []), record.rating]);
    const seasonRatings = [...ratingSeasons.entries()].map(([year, ratings]) => ({ year, rating: ratings.reduce((sum, value) => sum + value, 0) / ratings.length }));
    const peakSeason = seasonRatings.reduce<{ year: number | null; rating: number }>((best, item) => item.rating > best.rating ? item : best, { year: null, rating: 0 });
    const grade = peakRating >= 1.2 ? 'S' : peakRating >= 1.1 ? 'A' : peakRating >= 1.0 ? 'B' : peakRating >= 0.9 ? 'C' : 'D';

    return {
      player: {
        playerId: player.id,
        gameId: player.gameId,
        retiredAt: player.retiredAt,
        reason: null,
      },
      top20History,
      trophyRoom,
      mvpRoom,
      mvpTotals: {
        major: majorMvpCount,
        normal: mvpRoom.length - majorMvpCount,
      },
      careerOverview: {
        averageRating: player.career.rating2,
        totalKills: player.career.totalKills,
        totalMaps: player.career.mapsPlayed,
        clutchWon: player.career.clutchWon,
        careerEarnings: player.career.careerEarnings,
        majorChampionships: player.trophies.majorChampionships,
        otherSTierTitles: player.trophies.otherSTierTitles,
        grade,
        retiredAge: player.age,
        peakRating,
        peakSeason: peakSeason.year,
        peakSeasonRating: peakSeason.rating,
        peakSeasons: seasonRatings.filter((item) => item.rating >= Math.max(1.05, peakSeason.rating - 0.05)).length,
        tierBreakdown: {
          T2: archive.filter((record) => record.level === 'T2').length,
          T1: archive.filter((record) => record.level === 'T1').length,
          MAJOR: archive.filter((record) => record.level === 'MAJOR').length,
        },
      },
    };
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
