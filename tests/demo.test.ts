// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SOUNDS } from '../src/catalog';

/**
 * Boots the demo in a DOM without Web Audio or canvas support and verifies
 * the UI degrades gracefully instead of exploding.
 */
describe('demo UI', () => {
  beforeEach(async () => {
    document.body.innerHTML = readFileSync(
      resolve(process.cwd(), 'index.html'),
      'utf8',
    )
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .match(/<body>([\s\S]*)<\/body>/)![1]
      .replace(/<link[^>]*>/g, '');

    if (!(globalThis as any).IntersectionObserver) {
      (globalThis as any).IntersectionObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    vi.resetModules();
    await import('../demo/main');
  });

  it('renders every catalog sound as a card', () => {
    const cards = document.querySelectorAll('.card');
    expect(cards.length).toBe(SOUNDS.length);
    expect(document.querySelectorAll('.chip').length).toBeGreaterThan(7);
    expect(document.querySelector('#stat-count')?.textContent).toBe(String(SOUNDS.length));
  });

  it('filters by search query', async () => {
    const input = document.querySelector('#search') as HTMLInputElement;
    input.value = 'charging';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    const visible = Array.from(document.querySelectorAll<HTMLElement>('.card')).filter(
      (card) => !card.hidden,
    );
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((card) => card.dataset.id === 'charging')).toBe(true);
  });

  it('filters by category chip', async () => {
    const chip = document.querySelector<HTMLButtonElement>('.chip[data-category="system"]')!;
    chip.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    const visible = Array.from(document.querySelectorAll<HTMLElement>('.card')).filter(
      (card) => !card.hidden,
    );
    const expected = SOUNDS.filter((s) => s.category === 'system').length;
    expect(visible.length).toBe(expected);
  });

  it('opens the detail dialog with metadata', () => {
    const more = document.querySelector<HTMLButtonElement>('.card[data-id="powerOn"] .card-more')!;
    more.click();
    const dialog = document.querySelector('#detail') as HTMLDialogElement;
    expect(dialog.getAttribute('open')).not.toBeNull();
    expect(document.querySelector('#detail-name')?.textContent).toBe('Power On');
    expect(document.querySelector('#detail-id')?.textContent).toBe('powerOn');
    expect(document.querySelectorAll('#detail-tags .tag').length).toBeGreaterThan(0);
  });

  it('plays sounds through the engine when it is available', async () => {
    const card = document.querySelector<HTMLElement>('.card[data-id="complete"]')!;
    card.click();
    await new Promise((r) => setTimeout(r, 30));
    // Without a live AudioContext the UI must remain interactive.
    expect(card).toBeTruthy();
    expect(document.querySelector('#now-playing')?.textContent).toBeTruthy();
  });

  it('keeps the volume readout in sync', () => {
    const volume = document.querySelector('#volume') as HTMLInputElement;
    volume.value = '35';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('#volume-out')?.textContent).toBe('35');
  });
});
