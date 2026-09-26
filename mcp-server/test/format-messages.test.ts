import { describe, expect, it } from 'vitest';
import { cancelledMessage, failedMessage, retryHint } from '../src/format/messages.js';

describe('shared run messages', () => {
  it('cancelled / retry texts', () => {
    expect(cancelledMessage('r1')).toBe('Run r1 was cancelled in the DevDigest UI. Call run_agent_on_pr to start a new one.');
    expect(retryHint('r1')).toBe('retry get_findings with run_id=r1 in ~30s');
  });

  it('failed: sanitised, capped error; or the restart hint when none is recorded', () => {
    expect(failedMessage('r1', '\u001b[31mbad\u0000 key')).toBe(
      "Run r1 failed: bad key. Check the agent's model and API key in DevDigest Settings, then call run_agent_on_pr again.",
    );
    expect(failedMessage('r1', 'x'.repeat(1000)).length).toBeLessThan(450);
    for (const none of [null, undefined, '']) {
      expect(failedMessage('r1', none)).toBe(
        'Run r1 failed: no error recorded — the DevDigest API may have restarted mid-run. Call run_agent_on_pr again.',
      );
    }
  });
});
