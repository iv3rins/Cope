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
      },
    };
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
