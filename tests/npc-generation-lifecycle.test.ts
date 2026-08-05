import assert from 'node:assert/strict';
import test from 'node:test';
import { NpcGenerationServiceImpl } from '../src/hltv/npc-generation-service-impl';
import type { NpcGenerationProfile } from '../src/engine/npc';

const profile: NpcGenerationProfile = { origin: 'GENERATED_ACADEMY', countryPool: ['SE'], region: 'EUROPE', ageRange: [16, 20], roleWeights: { AWPER: 1, ENTRY_FRAGGER: 1 }, attributeRange: { aim: [58, 78] }, talentLevel: 'ACADEMY' };

test('NPC generation replenishes the requested population from configured profiles', async () => {
  const service = new NpcGenerationServiceImpl([], 123);
  const result = await service.generateSeason({ season: 2028, targetPopulation: 5, profiles: [profile] });
  assert.equal(result.generated.length, 5);
  assert.equal(new Set(result.generated.map((npc) => npc.id)).size, 5);
  assert.ok(result.generated.every((npc) => npc.age >= 16 && npc.age <= 20));
});
