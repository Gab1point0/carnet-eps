import { describe, expect, it } from 'vitest';
import { addToken, buildTimeline, createAnimation, createFrame, makeToken, removeToken, resolveFrame, sanitizeAnimation, stateAt } from './engine';

describe('animation', () => {
  it('suit le porteur (ballon conduit) et reste en place si le porteur est retiré', () => {
    let a = createAnimation('basket');
    const p = makeToken('player', '#2563eb', '1');
    const ball = makeToken('ball', '#f97316');
    a = addToken(a, p, { x: 20, y: 30 });
    a = addToken(a, ball, { x: 0, y: 0 });
    a.frames[0].pos[ball.id] = { x: 0, y: 0, carry: p.id, dx: 3, dy: 0 };
    expect(resolveFrame(a.tokens, a.frames[0])[ball.id]).toMatchObject({ x: 23, y: 30 });

    const without = removeToken(a, p.id);
    expect(without.frames[0].pos[ball.id]).toMatchObject({ x: 23, y: 30 });
    expect(without.frames[0].pos[ball.id].carry).toBeUndefined();
  });

  it('interpole les positions entre deux étapes', () => {
    let a = createAnimation();
    const p = makeToken('player', '#2563eb', '1');
    a = addToken(a, p, { x: 0, y: 0 });
    const f1 = createFrame(a.tokens, a.frames[0]);
    f1.pos[p.id] = { x: 100, y: 50 };
    f1.moveMs = 1000;
    a = { ...a, frames: [a.frames[0], f1] };
    const tl = buildTimeline(a);
    const mid = stateAt(a, tl, a.frames[0].holdMs + 500); // milieu du déplacement
    expect(mid.phase).toBe('move');
    expect(mid.rendered[p.id].x).toBeCloseTo(50, 0);
    const end = stateAt(a, tl, tl.total);
    expect(end.rendered[p.id].x).toBe(100);
  });

  it('répare une animation écrite à la main', () => {
    const fixed = sanitizeAnimation({
      court: 'volley',
      tokens: [{ id: 't1', kind: 'player', label: '', color: '#fff', size: 1 }],
      frames: [],
    });
    expect(fixed.frames).toHaveLength(1);
    expect(fixed.frames[0].pos.t1).toEqual({ x: 50, y: 50 });
  });
});
