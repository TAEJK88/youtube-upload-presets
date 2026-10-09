// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../entrypoints/sidepanel/App';
import { PaneBoundary } from '../entrypoints/sidepanel/PaneBoundary';
import { setLang } from '../lib/i18n';
import { renderPanel } from './panel-fake';

// One tab that fails to render, as the schedule box did with a cleared start (review C1).
vi.mock('../entrypoints/sidepanel/tabs/SettingsTab', () => ({
  SettingsTab: () => {
    throw new RangeError('Invalid time value');
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Boom(): never {
  throw new RangeError('Invalid time value');
}

describe('pane error boundary', () => {
  it('a render error in one tab shows a short message, logs it, and leaves the rest of the panel', () => {
    setLang('en');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <p>Channel bar</p>
        <PaneBoundary><Boom /></PaneBoundary>
        <PaneBoundary><p>Other tab</p></PaneBoundary>
      </div>,
    );
    expect(screen.getByRole('alert').textContent).toBe('This tab hit an error — close and reopen the side panel');
    expect(screen.getByText('Channel bar')).toBeTruthy();
    expect(screen.getByText('Other tab')).toBeTruthy();
    expect(err).toHaveBeenCalledWith('[ytup] panel render error', expect.any(RangeError));
  });

  it('the panel wraps each tab: a failing tab leaves the tabs and the other panes', () => {
    setLang('en');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel(<App />);
    expect(screen.getByRole('alert').textContent).toBe('This tab hit an error — close and reopen the side panel');
    expect(screen.getByRole('tab', { name: /Upload/ })).toBeTruthy();
    expect(err).toHaveBeenCalledWith('[ytup] panel render error', expect.any(RangeError));
  });
});
