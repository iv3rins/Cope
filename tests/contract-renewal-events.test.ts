import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ConditionEvaluatorImpl } from '../src/engine/impl/condition-evaluator';

const root = new URL('../', import.meta.url);

test('CONTRACT_ENDS_WITHIN 对缺失合同 fail-closed 并正确判断日期', () => {
  const evaluator = new ConditionEvaluatorImpl();
  const player: any = { currentContractId: 'c1', currentTeamId: 'team', difficultyMode: 'HARDCORE' };
  const base: any = { player, currentTeamId: 'team', opponentTeamId: null, randomRoll: 0.5, difficultyMode: 'HARDCORE', currentDate: '2026-01-01T00:00:00.000Z' };
  const condition: any = { type: 'CONTRACT_ENDS_WITHIN', days: 120 };
  assert.equal(evaluator.matches(condition, base), false);
  assert.equal(evaluator.matches(condition, { ...base, activeContract: { endsAt: '2026-03-01T00:00:00.000Z' } }), true);
  assert.equal(evaluator.matches(condition, { ...base, activeContract: { endsAt: '2027-03-01T00:00:00.000Z' } }), false);
});
