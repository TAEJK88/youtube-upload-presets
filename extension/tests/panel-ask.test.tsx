// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AskProvider, useAsk, type AskOptions } from '../entrypoints/sidepanel/ask';

afterEach(cleanup);

let ask!: (o: AskOptions) => Promise<boolean | null>;
function Grab() {
  ask = useAsk();
  return null;
}
const open = (o: AskOptions) => {
  let p!: Promise<boolean | null>;
  act(() => { p = ask(o); });
  return p;
};

describe('ask (the drawer\'s confirm box)', () => {
  it('two buttons: OK → true, Cancel → false, Escape → false', async () => {
    render(<AskProvider><Grab /></AskProvider>);
    let p = open({ title: 'Delete?', ok: 'Delete', danger: true });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await p).toBe(true);
    p = open({ title: 'Delete?' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await p).toBe(false);
    p = open({ title: 'Delete?' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(await p).toBe(false);
  });

  it('three buttons: the second answers false, dismissing answers null', async () => {
    render(<AskProvider><Grab /></AskProvider>);
    let p = open({ title: 'Import', ok: 'My file', no: "Someone else's" });
    fireEvent.click(screen.getByRole('button', { name: "Someone else's" }));
    expect(await p).toBe(false);
    p = open({ title: 'Import', ok: 'My file', no: "Someone else's" });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await p).toBe(null);
  });

  it('Enter confirms; a new question dismisses the open one', async () => {
    render(<AskProvider><Grab /></AskProvider>);
    const first = open({ title: 'One', ok: 'Yes', no: 'No' });
    const second = open({ title: 'Two' });
    expect(await first).toBe(null);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(await second).toBe(true);
  });
});
