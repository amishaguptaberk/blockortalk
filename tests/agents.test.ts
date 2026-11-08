import { describe, expect, it } from 'vitest';
import { CALLBACK_LINES, CODE_REQUEST_LINES } from '../lib/challenge/scenarios';
import { applyEvent, poseFolder, stateInputs } from '../lib/agents/machine';
import { BENIGN_OPENING, SIGN_IN_CODE_ASK, riskyRequest } from '../lib/agents/risky';
import { companionForSession } from '../lib/agents/session';

describe('risky requests', () => {
  it('uses the real sign-in code line and ignores a warning and an opening', () => {
    expect(SIGN_IN_CODE_ASK).toBe(CODE_REQUEST_LINES[0]);
    expect(riskyRequest(SIGN_IN_CODE_ASK)?.message).toBe("They're asking for a sign-in code. Keep that private.");
    expect(riskyRequest(CODE_REQUEST_LINES[1])?.message).toBe("They're asking for a sign-in code. Keep that private.");
    expect(riskyRequest('Read the code on the back of your gift card so we can lock the equipment list today.')?.message).toBe("They're asking for a gift-card code. Keep that private.");
    expect(riskyRequest('Can you confirm your date of birth so I can block it?')?.message).toContain('personal details');
    expect(riskyRequest(BENIGN_OPENING)).toBeNull();
    expect(riskyRequest('Did you make the $23.40 restaurant charge yesterday?')).toBeNull();
    expect(riskyRequest(CALLBACK_LINES[2])).toBeNull();
  });
});

describe('agent state machine', () => {
  it('keeps exactly one state input on, and ignores an alert with no risky line', () => {
    const start = applyEvent({ personality: 'planner', state: 'planning', pose: 'speaking', message: 'ready' }, 'scenario_loaded');
    expect(stateInputs(start.state)).toEqual({ planning: true, listening: false, thinking: false, alert: false, success: false, concerned: false, debrief: false });
    expect(applyEvent(start, 'risk_signal_detected')).toBe(start);
    expect(applyEvent(start, 'risk_signal_detected', { text: BENIGN_OPENING })).toBe(start);
    const alert = applyEvent(start, 'risk_signal_detected', { text: SIGN_IN_CODE_ASK });
    expect(alert.state).toBe('alert');
    expect(alert.exchange).toBe(SIGN_IN_CODE_ASK);
    expect(poseFolder(alert.pose)).toBe('talk_thinking');
    expect(applyEvent(alert, 'protective_action_taken').state).toBe('success');
    expect(applyEvent(alert, 'unsafe_action_taken').state).toBe('concerned');
    expect(applyEvent(alert, 'debrief_started').personality).toBe('debrief');
    expect(poseFolder('speaking')).toBe('talk_standard');
    expect(poseFolder('listening')).toBe('idle');
  });
});

describe('practice session', () => {
  it('alerts only on the caller request, then follows a verify or a leak', () => {
    const ask = SIGN_IN_CODE_ASK;
    expect(companionForSession({ phase: 'intro', turns: [], events: [] }).message).toBe("I'll help you prepare before the call starts.");
    expect(companionForSession({ phase: 'call', turns: [{ role: 'assistant', text: BENIGN_OPENING, at: '1' }], events: [] }).state).toBe('listening');
    expect(companionForSession({ phase: 'call', turns: [{ role: 'assistant', text: ask, at: '2' }], events: [] }).state).toBe('alert');
    expect(companionForSession({
      phase: 'call',
      turns: [{ role: 'assistant', text: ask, at: '2' }, { role: 'user', text: 'I will check through my own app.', at: '3' }],
      events: [{ at: '4' }],
    }).state).toBe('success');
    expect(companionForSession({
      phase: 'call',
      turns: [{ role: 'assistant', text: ask, at: '2' }, { role: 'user', text: 'The code is 551274', at: '3' }],
      events: [],
    }).state).toBe('concerned');
    const done = companionForSession({ phase: 'complete', turns: [{ role: 'assistant', text: ask, at: '2' }], events: [] });
    expect(done.state).toBe('debrief');
    expect(done.exchange).toBe(ask);
    expect(done.message).toBe("Let's look at the moment that mattered.");
  });
});
